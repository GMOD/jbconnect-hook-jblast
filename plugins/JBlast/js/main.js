/* 
    JBlast - Client Side Plugin X

    Created on : Mar 20, 2016, 6:38:33 PM
    Author     : ey
*/

define([
        'dojo/_base/declare',
        'dojo/_base/lang',
        'dojo/Deferred',
        'dojo/dom-construct',
        'dojo/query',
        'JBrowse/Plugin',
           'dijit/form/Button',
           'dijit/Dialog',
           "dojo/store/Memory",
           "dijit/form/ComboBox",
            'dijit/Menu',
            'dijit/MenuItem',
           'JBrowse/has',
           './tabs'
       ],
       function(
        declare,
        lang,
        Deferred,
        domConstruct,
        query,
        JBrowsePlugin,
        Button, Dialog, Memory, ComboBox,Menu,MenuItem,has,
        JBTabs
       ) {
return declare( JBrowsePlugin,
{
    constructor: function( args ) {
        console.log("plugin: JBlast ",args);
        //console.dir(args);
        
        var thisB = this;
        var browser = this.browser;

        $.get("plugins/JBlast/BlastPanel.html", function(data){
            //console.log("loaded BlastPanel.html");
            $('body').append(data);
        });
        
        // remove array element by name
        Array.prototype.remove = function() {
            var what, a = arguments, L = a.length, ax;
            while (L && this.length) {
                what = a[--L];
                while ((ax = this.indexOf(what)) !== -1) {
                    this.splice(ax, 1);
                }
            }
            return this;
        };            

        // intercept Browser.showTracks
        // when not logged in, filter out REST tracks
        // we are basically checking to see if the url tracks are in the pruned track list.
        browser.orig_showTracks = browser.showTracks,
        browser.showTracks = function( trackNames ) {
            //trackNames = trackNames.remove('jblast_sample');
            if (thisB.browser.loginState) return browser.orig_showTracks(trackNames);

            let trackNames1 = [];
            let confTracks = browser.config.tracks;
            
            for(let i=0; i < trackNames.length;i++) {
                for(let j=0;j<confTracks.length;j++) {
                    if ( confTracks[j].label === trackNames[i] ){
                        trackNames1.push(trackNames[i]);
                        break;
                    }
                }
            }
            return browser.orig_showTracks(trackNames1);
        };
        

        browser.afterMilestone( 'loadConfig', function() {
            // if we are not logged in, hide REST tracks.
            thisB.loginState = false;
            $.get("/loginstate",function(data) {
                //console.log("loginstate",data);
                thisB.loginState = data.loginstate;
                if (!thisB.loginState) {
                    let conf = dojo.clone(browser.config.tracks);
                    browser.config.tracks = [];
                    for(let i=0; i < conf.length;i++) {
                        if (typeof conf[i].urlTemplate === 'undefined' || conf[i].urlTemplate.charAt(0) !== "/") {
                            browser.config.tracks.push(conf[i]);
                        }
                        else {
                            console.log(conf[i].label, "track requires login");
                        }
                    }
                }
            });
        });
        
        browser.jblast = {
            asset: null,
            focusQueue: [],
            focusQueueProc: 0,
            panelDelayTimer: null,
			bpSizeLimit: args.bpSizeLimit || 0
		};
        
        /*
         * class override function intercepts
         */
        browser.afterMilestone( 'initView', function() {
            
            thisB.jblastTabs = new JBTabs({
                plugin: thisB,
                browser: browser
            });
            
            // skip the following if not logged in  <-------------------------
            if (!thisB.browser.loginState) return;

            if (typeof browser.config.classInterceptList === 'undefined') {
                browser.config.classInterceptList = {};
            }
            
            setInterval(function() {
                if ($('div.popup-dialog div.feature-detail')[0]) {
                    thisB.insertFeatureDetail();
                } 
            },2000);
            // override _FeatureDetailMixin
//            require(["dojo/_base/lang", "JBrowse/View/Track/_FeatureDetailMixin"], function(lang, _FeatureDetailMixin){
//                lang.extend(_FeatureDetailMixin, {
//                    extendedRender: thisB.FeatureDetailMixin_extendedRender,
//                    blah: "blah"
//                });
//            });
            
            // override BlockBased
            require(["dojo/_base/lang", "JBrowse/View/Track/BlockBased"], function(lang, BlockBased){
                lang.extend(BlockBased, {
                    postRenderHighlight: thisB.BlockBased_postRenderHighlight
                });
            });
            
            // override FASTA
            require(["dojo/_base/lang", "JBrowse/View/FASTA"], function(lang, FASTA){
                lang.extend(FASTA, {
                    addButtons: thisB.FASTA_addButtons
                });
            });
            // override Browser
            require(["dojo/_base/lang", "JBrowse/Browser"], function(lang, Browser){
                lang.extend(Browser, {
					// handle highlight off 
                    clearHighlight: function() {
                        if( this._highlight ) {
                            $("[widgetid='jblast-toolbtn']").hide();
                            //domStyle.set(thisB.browser.jblast.blastButton, 'display', 'none');  // don't work, why?
                            delete this._highlight;
                            this.publish( '/jbrowse/v1/n/globalHighlightChanged', [] );
                        }
                    }
                });
            });
            browser.jblastDialog = thisB.Browser_jblastDialog;

            
            // setup right click menu for highlight region - for arbitrary region selection
            thisB.jblastRightClickMenuInit();
            
            // start filter panel hide/show queue, filter panel management
            thisB.startFocusQueue();

            /*
             * create the blast button on the toolbar
             */ 

            var navBox = dojo.byId("navbox");

            thisB.browser.jblast.blastButton = new Button(
            {
                title: "BLAST highlighted region",
                id: "jblast-toolbtn",
                //width: "24px",
				//height: "17px",
				label: "Blast",
                onClick: dojo.hitch( thisB, function(event) {
                    //thisB.browser.showTrackLabels("toggle");
					//console.log("blast click");
					thisB.startBlast();
                    dojo.stopEvent(event);
                })
            }, dojo.create('button',{},navBox));   //thisB.browser.navBox));
        
            // save the reference to the blast plugin in browser
            browser.jblastPlugin = thisB;

            /*
             * JBrowse event handlers
             */
            dojo.subscribe("/jbrowse/v1/n/tracks/focus", function(track){
                console.log("jblast plugin event: /jbrowse/v1/n/tracks/focus",track);
                if (track===null) return;
                if (typeof track.config.jblast !== 'undefined') {
                    // for jblast tracks, the label is the asset and also the reference to the filterSettings of the asset
                    thisB.browser.jblast.asset = track.config.label;
                    thisB.insertBlastPanel(track.config);
                }
            });        
            dojo.subscribe("/jbrowse/v1/n/tracks/unfocus", function(track){
                console.log("jblast plugin event: /jbrowse/v1/n/tracks/unfocus",track);
                if (typeof track.config.jblast !== 'undefined') {
                    thisB.removeBlastPanel(track.config);
                    thisB.browser.jblast.asset = null;
                }
            });        
            dojo.subscribe("/jbrowse/v1/v/tracks/show", function(trackConfigs){
                console.log("jblast plugin event: /jbrowse/v1/v/tracks/show",trackConfigs);
                if (typeof trackConfigs[0].jblast !== 'undefined') {
                    if (browser.jblast.panelDelayTimer === null){
                        browser.jblast.panelDelayTimer = setTimeout(function(){
                            console.log("timeout");
                            var track = thisB.findTrack(trackConfigs[0].label);
                            browser.view.setTrackFocus(track,1);
                            browser.jblast.panelDelayTimer = null;
                        },100);     // normally 1000
                    }
                }
            });        
            dojo.subscribe("/jbrowse/v1/v/tracks/hide", function(trackConfigs){
                console.log("jblast plugin event: /jbrowse/v1/v/tracks/hide",trackConfigs);
                if (typeof trackConfigs[0].jblast !== 'undefined')
                    thisB.removeBlastPanel(trackConfigs[0]);
            });        
        });
    },
    // look in the browser's track configuration for the track with the given label
    findTrackConfig: function( trackLabel ) {
        if( ! trackLabel )
            return null;

        var tracks = this.browser.config.tracks;
        
        for(var i in tracks) {
            if (tracks[i].label === trackLabel)
                return tracks[i];
        }
        return null;
    },
    // find track given label
    findTrack: function( trackLabel ) {
        if( ! trackLabel )
            return null;

        var tracks = this.browser.view.tracks;
        
        //console.log(">> trackLabel",trackLabel,tracks.length);
        for(var i in tracks) {
            //console.log(tracks[i]);
            if (typeof tracks[i].config !== 'undefined' && tracks[i].config.label === trackLabel)
                return tracks[i];
        }
        return null;
    },
    
    setupFeatureToolTips: function() {
        var thisB = this;
        var browser = this.browser;
        setTimeout(function() {
            // setup tooltip
            $('.blast-feature').each(function() {
                var key = $(this).attr('blastkey');
                var hit = browser.blastDataJSON.BlastOutput.BlastOutput_iterations.Iteration.Hit[key];
                //console.log('key-hit ',key,hit);
                if (typeof hit !== 'undefined') {
                    var text = '<div>'+browser.jblastPlugin.blastRenderHit(hit); //+'<button class="btn btn-primary" blastkey="'+key+'"onclick="JBrowse.blastGoto(this)">Goto</button></div>';

                    $(this).qtip({
                        content: {
                            text: text,
                            title: hit.Hit_def
                        },
                        style: {
                            classes: 'blastQtip qtip-tipped', //'qtip-tipped' 'ui-tooltip-blue
                            width: "400px"
                        },
                        position: { // tooltip shows up near mouse
                            //target: 'mouse'
                            // language: 'my' tooltip positioned 'at' position of target 
                            my: 'top left',
                            at: 'bottom left'
                        },
                        hide: {     // allow mouse to move into tip
                            //event:'unfocus'
                            delay: 500,
                            fixed: true
                        }
                    });

                }
                else {
                    console.log('undefined blastkey', key, '(this happens for test json file');
                }
            });            
        },1000);
    },
    /**
     * inserts blast feature details if appropriate blast track
     * @param {object} track (optional)
     * @returns {undefined}
     */
    insertFeatureDetail: function(track) {
        var thisB = this;
        var browser = this.browser;
        var blastPlugin = this.browser.jblastPlugin;
        var lastBlastKey = "";
        var blastShow = 0;
        var blastField = $('div.popup-dialog div.feature-detail h2.blasthit')[0];

        var asset = '';
        if (!track) asset = this.getTrackAssetId();
        else asset = track.config.label;

        if (typeof blastField !== 'undefined') blastShow = $(blastField).attr('blastshown');

        //console.log("monitor",blastField,blastShow,typeof blastShow);

        if (typeof blastField !== 'undefined') {// && blastShow !== '1') {
            var blastKey = $('div.popup-dialog div.feature-detail div.value_container div.blasthit').html();
            if (blastKey !== lastBlastKey) {
                //console.log("new blast dialog key = "+blastKey);
                var regionObj = $('div.popup-dialog div.feature-detail div.field_container h2.feature_sequence');
                var rObjP = $(regionObj).parent();
                //console.log(regionObj,rObjP);
                var hasBlastDetail = $('#blastDialogDetail');
                //console.log('blastDialogDetail',$('#blastDialogDetail').length);
                if ($('#blastDialogDetail').length===0) {
                    console.log('blastDialogDetail created');
                    $('<div id="blastDialogDetail"><h2 class="blastDetailTitle sectiontitle">BLAST Results</h2><div id="blastHspBlock">Rendering...</div></div>').insertBefore(rObjP);

                    var dataset = encodeURIComponent(browser.config.dataRoot);
                    var hitkey = blastKey;
                    var url = '/service/exec/get_hit_details/?asset='+asset+'&dataset='+dataset+'&hitkey='+hitkey;
                    $.get( url, function(hitData) {
                        console.log("get_hit_details data",hitkey,hitData);
                        
                        var blastContent = "";
                        for(let i in hitData) {
                            var hit = hitData[i];

							// display Hit HSP info
							if (i === hitkey) {
								blastContent += thisB.blastRenderHitCommon(hit);
								blastContent += blastPlugin.blastRenderHit(hit);
								blastContent += blastPlugin.blastRenderHitBp(hit);
							}
                        }
						// display other HSPs of the hit
						blastContent += "<h2>Other HSPs of the hit</h2>";
						for (i in hitData) {
                            var hit = hitData[i];
							if (i !== hitkey) {
								blastContent += blastPlugin.blastRenderHit(hit);
								blastContent += blastPlugin.blastRenderHitBp(hit);
								blastContent += "<hr>";
							}
						}
                        $('#blastHspBlock').html(blastContent);
                    })
					.fail(function() {
						console.log("error",url);
					});                    
                }
            }
        }
            
    },
    // get track asset id from the feature detail dialog box
    getTrackAssetId() {
        let n1 = $('div.popup-dialog div.feature-detail').attr('class').split(' ');
        let trackkey = n1[n1.length-1].split('feature-detail-')[1];

        return trackkey;
    },
    blastRenderHitCommon: function(hit) {
        var txt = '';
        
        //txt += '<div class="CSSTableGenerator">';
        txt += '<div class="blast-table-view">';
        txt += '<table class="hsp-table" style="width:100px"><tr id="head">';  //class="CSSTableGenerator "
        txt +=    '<td class="field blast-field">Accession</td>';
        txt +=    '<td class="field blast-field">Sequence ID</td>';
        txt +=    '<td class="field blast-field">Length</td>';
        txt += '</tr><tr>';
        txt +=    '<td class="blast-value"> id="details_accession"'+ hit.Hit_accession+'</td>';
        txt +=    '<td class="blast-value">'+ hit.Hit_id+'</td>';
        txt +=    '<td class="blast-value">'+hit.Hit_len+'</td>';
        txt += '</tr></table>';
        txt += '</div>';
        txt += '<hr>';
        
        return txt;
        
    },
    // this renders the summary information for the hit
    blastRenderHit: function(hit){
        //console.log("blastRenderHit",hit);
        var txt = '';

        var hstart = parseInt(hit.Hsp["Hsp_hit-from"]);
        var hend = parseInt(hit.Hsp["Hsp_hit-to"]);
        var strand = hend - hstart > 0 ? "+" : "-";
        
        txt += '<div class="blast-table-view">';
        txt += '<table class="hsp-table" style="width:100px"><tr id="head">';  //class="CSSTableGenerator "
        txt +=    '<td class="field blast-field">HSP Num</td>';
        txt +=    '<td class="field blast-field">Score</td>';
        txt +=    '<td class="field blast-field">Expect</td>';
        txt +=    '<td class="field blast-field">Identities</td>';
        txt +=    '<td class="field blast-field">Gaps</td>';
        txt +=    '<td class="field blast-field">Strand</td>';
        txt +=    '<td class="field blast-field">Align Len</td>';
        txt += '</tr><tr>';
        txt +=    '<td class="blast-value">'+hit.Hsp.Hsp_num+'</td>';
        txt +=    '<td class="blast-value">'+ parseInt(hit.Hsp['Hsp_bit-score'])+' ('+hit.Hsp.Hsp_score+')</td>';
        txt +=    '<td class="blast-value">'+Number(hit.Hsp.Hsp_evalue).toExponential(2)+'</td>';
        txt +=    '<td class="blast-value">'+(hit.Hsp.Hsp_identity/hit.Hsp['Hsp_align-len']*100).toFixed(2)+'</td>';
        txt +=    '<td class="blast-value">'+(hit.Hsp.Hsp_gaps/hit.Hsp['Hsp_align-len']*100).toFixed(2)+'</td>';
        txt +=    '<td class="blast-value">'+strand+'</td>';
        txt +=    '<td class="blast-value">'+hit.Hsp['Hsp_align-len']+'</td>';
        txt += '</tr></table>';
        txt += '</div>'
        
        return txt;
    },
    // this renders the query/subject table of the details
    // it also draws the coordinate 
    blastRenderHitBp: function(hit){
        
        var coordHstr = repeatChar(hit.Hsp.Hsp_hseq.length," ");    //"┬"
        var coordQstr = repeatChar(hit.Hsp.Hsp_hseq.length," ");    //"┴"
        var len = hit.Hsp['Hsp_align-len'];
        //console.log("hitlen",len,hit);
        
        var coordHbase = 0;
        var coordH = parseInt(hit.Hsp['Hsp_hit-from']);
        var coordQbase = 0;
        var coordQ = parseInt(hit.Hsp['Hsp_query-from']);
        
        var inc = 20;       // draw coord every (inc) base pairs.
        for(var i = 0; i < len;i += inc) {
            coordHstr = overwriteStr(coordHstr,coordHbase+i,"├"+(coordH+i));
            coordQstr = overwriteStr(coordQstr,coordQbase+i,"├"+(coordQ+i));
        }
    
        // use a monospace font
        // todo: move styles out to the CSS file
        var txt = '';
        txt += '<div class="blast-bp-view" style="font-family: monospace;white-space:pre; width:100%;overflow:auto">';
        txt += '<span style="background-color:#eee">'+coordHstr+'</span><br/>';
        txt += hit.Hsp.Hsp_hseq + '<br/>';
        txt += hit.Hsp.Hsp_midline + '<br/>';
        txt += hit.Hsp.Hsp_qseq + '<br/>';
        txt += '<span style="background-color:#eee">'+coordQstr+'</span>';
        txt += '</div>';
        return txt;
    },
    // render blast summary (used in bottom blast panel)
    blastRenderSummary: function(hit) {
        var txt = '';
        txt +=  '<table  cellspacing="1" style="width:100%"><tr>';
        txt +=    '<td class="blastSummaryItem" align="center">'+hit.Hsp['Hsp_bit-score']+'</td>';
        txt +=    '<td class="blastSummaryItem" align="center">'+hit.Hsp.Hsp_evalue+'</td>';
        txt +=    '<td class="blastSummaryItem" align="center">'+hit.Hsp.Hsp_identity/hit.Hsp['Hsp_align-len']*100+'</td>';
        txt +=    '<td class="blastSummaryItem" align="center">'+hit.Hsp.Hsp_gaps/hit.Hsp['Hsp_align-len']*100+'</td>';
        txt += '</tr></table>';  
        return txt;
    },
/*********************************************************
 * Track Focus - Blast Panel 
 *********************************************************/    
    
    startFocusQueue: function() {
        var thisB = this;
        setInterval(function() {
            if (thisB.browser.jblast.focusQueueProc == 0  && thisB.browser.jblast.focusQueue.length > 0)
                thisB.processAction();
        },300);
    },
    processAction: function() {
        this.jblastTabs.processAction(this,this.browser);
    },
    
    insertBlastPanel: function(trackConfig) {
        //console.log("insertBlastPanel2",this.browser.jblast.focusQueue);
        var queue = this.browser.jblast.focusQueue;
        queue.push({action:'show',trackConfig:trackConfig});
    },
    removeBlastPanel: function() {
        //console.log("removeBlastPanel2",this.browser.jblast.focusQueue);
        var queue = this.browser.jblast.focusQueue;
        queue.push({action:'hide'});
    },
    setupFilterSliders: function(trackConfig) {
        //console.log("setupFilterSliders1");
        var thisB = this;
        var config = this.browser.config;
        var url = config.dataRoot + '/' + trackConfig.filterSettings;
        //var filterSlider = this.browser.jblast.filterSliders;
        
        console.log('url',url);
        var jqxhr = $.getJSON( url, function(data) {
            console.log( "filter data read success", data);
			
			setup_score_slider();
			setup_evalue_slider();
			setup_identity_slider();
			setup_gap_slider();
			
			
            // setup score slider****************************
			function setup_score_slider() {
				var lo = data.score.min;
				var hi = data.score.max;
				var step = Math.round((hi-lo) / 4);

				$("#slider-score").slider({
					min: lo,
					max: hi,
					values: [data.score.val],
					slide: function(event,ui) {
						var v = ui.value;
						$('#slider-score-data').html(v);
					},
					change: function(event,ui) {
						var v = ui.value;
						var data = {score:{val:v}};
						thisB.sendChange(data,trackConfig);
					}
				})
				.slider('pips', {
					rest:'label',
					step: step
				});
				setTimeout(function() {	// initial render
					$('#slider-score-data').html(data.score.val);
				},100);
			}
            // setup evalue slider *******************************
			function setup_evalue_slider() {
				var hi = Math.log10(data.evalue.max);
				var lo = Math.log10(data.evalue.min);
				var same = data.evalue.max===data.evalue.min;
				if (!isFinite(lo)) lo = 0;
				var nstep = 99;
				var step = (hi - lo) / nstep;

				//console.log("evalue step",hi,lo,hi-lo,step);
				// setup labels
				var pstep = 5;
				var labels = [];
				for(var i=0;i < 99;i++) {
					var v = lo + i*step;
					if (same) labels.push("");
					else labels.push(Math.pow(10,v).toExponential(1));
				}
				if (same) {
					labels.push("");
				}
				else {
					labels.push(Math.pow(10,hi).toExponential(1));
					//labels.push(""+99);
				}
				//console.log("evalue labels",labels);

				// map evalue into 0-99 space
				var initVal = Math.round((Math.log10(data.evalue.val)-lo) / (hi - lo)*100);
				$("#slider-evalue").slider({
					min: 0,
					max: 99,
					step: 1, //step,
					values: [initVal],
					slide: function(event,ui) {
						var i = +ui.value;
						var ev = i*step + lo;
						if (!same) $('#slider-evalue-data').html(Math.pow(10,ev).toExponential(1));
					},
					change: function(event,ui) {
						var i = +ui.value;
						var val = Math.pow(10,i*step + lo);
						var data = {evalue:{val:val}};
						if (!same)
							thisB.sendChange(data,trackConfig);
					}
				}).slider("pips",{
					rest:'label',
					labels: labels,
					step: 25
				});
				setTimeout(function() {	// initial render value
					if (same) {
						$('#slider-evalue-data').html("N/A");
						$("#slider-evalue").css("pointer-events","none");
					}
					else $('#slider-evalue-data').html(data.evalue.val.toExponential(1));
				},100);
			}
            // setup identity slider ************************
			function setup_identity_slider() {
				var hi = data.identity.max;
				var lo = data.identity.min;
				var step = (hi - lo) / 20;

				// pip setup
				var pstep = 5;
				var labels = [];
				for(var i=lo;i <= hi; i += pstep*step) {
					labels.push(""+Math.round(i));
				}

				$("#slider-identity").slider({
					min: lo,
					max: hi,
					step: step,
					values: [data.identity.val],
					slide: function(event,ui) {
						var v = ui.value + '%';
						$('#slider-identity-data').html(v);
						//filterSlider.identity = parseInt(v);
					},
					change: function(event,ui) {
						var v = ui.value;
						var data = {identity:{val:v}};
						thisB.sendChange(data,trackConfig);
					}
				}).slider("pips",{
					rest:'label',
					first:'label',
					last:'label',
					step: pstep,
					suffix: '%'
				});
				setTimeout(function() {	// initial render value
					$('#slider-identity-data').html(data.identity.val + '%');
				},100);
			}
            // setup gap slider ********************
			function setup_gap_slider() {
				var hi = data.gaps.max;
				var lo = data.gaps.min;
				var step = (hi - lo) / 20;

				var pstep = 5;
				var labels = [];
				for(var i=lo;i <= hi; i += pstep*step) {
					labels.push(i);
				}
				$("#slider-gap").slider({
					min: lo,
					max: hi,
					step: step,
					values: [data.gaps.val],
					slide: function(event,ui) {
						var v = ui.value + '%';
						$('#slider-gap-data').html(v);
					},
					change: function(event,ui) {
						var v = ui.value;
						var data = {gaps:{val:v}};
						thisB.sendChange(data,trackConfig);
					}
					
				}).slider("pips",{
					rest: 'label',
					first: 'label',
					last: 'label',
					step: pstep,
					suffix: '%'
				});
				setTimeout(function() {	// initial render value
					$('#slider-gap-data').html(data.gaps.val+'%');
				},100);
			}
        });
        
    },
    sendChange: function(data,trackConfig) {
        // do http post
        var postData = {
              filterParams: data,
              asset: this.browser.jblast.asset,
              dataset: this.browser.config.dataRoot
        }
        //console.log("postData",postData);
        $.post( "/service/exec/set_filter", postData , function( data) {
            //console.log( "/set_filter",postData,data );
            $('.blast-hit-data').html("Hits: ("+data.filteredHits+'/'+data.hits+")");
        }, "json");
    },

/*************************************************
 * Class overrides
 *************************************************/               
    FeatureDetailMixin_extendedRender: function(track, f, featDiv, container) {
        setTimeout(function() {
            thisB.insertFeatureDetail(track);
        },1000);
    },
              
    // adds Blast button
    FASTA_addButtons: function (region,seq, toolbar) {
        let text = this.renderText( region, seq );
		//console.log("addButtons region, size",region,region.end-region.start,text);
        let thisB = this;
		let bpSize = region.end-region.start;
		
        toolbar.addChild( new Button({ 
            iconClass: 'dijitIconFunction',
            label: 'BLAST',
            title: 'BLAST this feature',
            disabled: ! has('save-generated-files'),
            onClick: function() {
                //thisB.blastDialog(text);
                JBrowse.jblastDialog(text,bpSize);
            }
        }));
    },
    jblastRightClickMenuInit: function(highlight) {
        console.log("jblastRightClickMenuInit");
        var thisB = this;
        var browser = this.browser;
        var handlers = {
            // handler for clicks on task context menu items
            onTaskItemClick: function(event) {
                //browser.jblastDialog();
                // get sequence store and ac
		thisB.startBlast();
            }
        };
        // create task menu as context menu for task nodes.
        
        var menu = new Menu({
                id: "jblastRCMenu"
        });
        menu.addChild(new MenuItem({
                id: "jblast-region",
                label: "BLAST highlighted region...",
                onClick: lang.hitch(handlers, "onTaskItemClick")
        }) );
        menu.startup();
        menu.note = "right-click hilite menu";

        browser.jblastHiliteMenu = menu;
    },
    /**
     * Display blast dialog box
     * @returns {undefined}
     */
    startBlast: function() {
        var thisB = this;
        var browser = this.browser;
        browser.getStore('refseqs', dojo.hitch(this,function( refSeqStore ) {
            if( refSeqStore ) {
                var hilite = browser._highlight;
                refSeqStore.getReferenceSequence(
                    hilite,
                    dojo.hitch( this, function( seq ) {
						let bpSize = hilite.end-hilite.start;
                        console.log('startBlast() found sequence',hilite,bpSize);
                        require(["JBrowse/View/FASTA"], function(FASTA){
                            var fasta = new FASTA();
                            var fastaData = fasta.renderText(hilite,seq);
                            console.log('FASTA',fastaData);
                            //delete fasta;
                            browser.jblastDialog(fastaData,bpSize);
                        });                                

                    })
                );
            }
        }));             
    },
    /**
     * called when highlight region is created
     * @param {type} node - DOM Node of highlight region (yellow region)
     * @returns nothing significant
     */
    BlockBased_postRenderHighlight: function(node) {
        console.log('postRenderHighlight');
        
        // add hilight menu to node
        if (typeof JBrowse.jblastHiliteMenu !== 'undefined') {
            JBrowse.jblastHiliteMenu.bindDomNode(node);
            $("[widgetid='jblast-toolbtn']").show();
            //domStyle.set(thisB.browser.jblast.blastButton, 'display', 'inline'); // dont work, why??
        }
    },
    // display blast dialog
    Browser_jblastDialog: function (region,bpSize) {
        var regionB = region;
        var thisB = this;
        var comboData = [];
		let bpSizeLimit = JBrowse.jblast.bpSizeLimit;

		console.log("blastDialog sizelimit",JBrowse.jblast,bpSizeLimit);

		if (bpSizeLimit && bpSize > bpSizeLimit) {
			alert("Query size is "+bpSize+".  The query size is limited to "+bpSizeLimit+" bp for demonstration purposes.");
			return;
		}


        getWorkflows(function(workflows){

            if (workflows.length==0) {
                alert("no workflows found");
                return;
            }
            
            var stateStore = new Memory({
                data: comboData
            });
            
            function destroyBlastDialog() {
                dialog.destroyRecursive();
            };
            var dialog = new Dialog({ 
                title: 'Process BLAST',
                onHide: function() {
                    destroyBlastDialog();
                }
            });
            
            dojo.create('span', {
                innerHTML: 'Workflow '
            }, dialog.containerNode);
            
            dojo.create('button', {
                id: 'blast-workflow-select'
            }, dialog.containerNode);
            
            for(var i in workflows) {
                console.log("workflow",workflows[i]);
                if (!workflows[i].deleted) {
                    comboData.push({'name': workflows[i].name, 'id':workflows[i].id});
                }
            }

            var comboBox = new ComboBox({
                id: "workflow-combo",
                name: "workflow",
                value: comboData[0].name,
                store: stateStore,
                searchAttr: "name"
            }, "blast-workflow-select").startup();            
            
            dojo.create('div', {
                id: 'blast-box',
                style: {'margin-top': '20px'},
                innerHTML: 'This will process a BLAST search against the selected database.<br/><button id="submit-btn" type="button">Submit</button> <button id="cancel-btn" type="button">Cancel</button>'
            }, dialog.containerNode);

            var submitBtn = new Button({
                label: "Submit",
                onClick: function(){
                    
                    // get selected workflow
                    var selStr = dijit.byId('workflow-combo').get('value');
                    for(var x in comboData) {
                        if (comboData[x].name == selStr) {
                            var selWorkflow = comboData[x].id;
                            console.log('Selected workflow',selWorkflow,comboData[x].name);
                        }
                    }
                    console.log('Selected workflow',selWorkflow);
                    
                    var postData = {
                          service: "jblast",
                          dataset: thisB.config.dataRoot,
                          region: regionB,
                          workflow: selWorkflow
                      };
                    $.post( "/job/submit", postData , function( result ) {
                        console.log( result );
                    }, "json");


                    // show confirm submit box
                    var confirmBox = new Dialog({ title: 'Confirmation' });
                    dojo.create('div', {
                        id: 'confirm-btn',
                        innerHTML: 'BLAST submitted...'
                    }, confirmBox.containerNode );
                    confirmBox.show();

                    setTimeout(function(){
                        confirmBox.destroyRecursive();
                    }, 2000);

                    destroyBlastDialog();
                }
            }, "submit-btn").startup();
            var cancelBtn = new Button({
                label: "Cancel",
                onClick: function(){
                    destroyBlastDialog();
                }
            }, "cancel-btn").startup();
            
			console.log("query region: ",regionB);
			
            if (dialog) dialog.show();

        });
        
    }
    
});
});

/**
 * get galaxy workflows (using jbrowse api)
 * @param {type} cb - cb(workflows]]
 * @returns {getWorkflows}
 */
function getWorkflows(cb) {
    var thisB = this;

    var xhrArgs = {
      url: "/jbapi/getworkflows",
      handleAs: "json",
      preventCache: true,
      load: function(data){
            console.log("get workflows result", data);
            cb(data);
      },
      error: function(error){
      }
    }

    // Call the asynchronous xhrGet
    //var deferred = dojo.xhrGet(xhrArgs);
    $.get( "/service/exec/get_workflows", function( data ) {
        console.log("get workflows result", data);
        cb(data);
    });
}

// overwrite a string with another string at the given location
function overwriteStr(subjStr, at, withStr) {
      var partL = subjStr;
      var withLen = withStr.length;
      if (at >= subjStr.length) return subjStr;
      var partL = subjStr.substring(0, at);
            if ((at + withLen) > subjStr.length) {
        var cut = (at + withLen) - subjStr.length;
        return partL + withStr.substring(0,withLen-cut);
      }
      if ((withLen+partL.length) == subjStr.length) return partL + withStr;
      var lenR = subjStr.length - withLen - partL.length;
      var partR = subjStr.substring(subjStr.length - lenR, subjStr.length);
      return partL + withStr + partR;
}

// return a string of characters (ch) length (count)
// "33333" = repearChar(5,"3");
function repeatChar(count, ch) {
      if (count == 0) return "";
      var count2 = count / 2,
        result = ch;

      while (result.length <= count2) {
        result += result;
      }
      return result + result.substring(0, count - result.length);
}
