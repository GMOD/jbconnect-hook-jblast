/**
 * @module
 * @description
 * This module implements the various REST APIs for JBlast.  
 */
var request = require('request');
var requestp = require('request-promise');
var path = require('path');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require("fs"));
var deferred = require('deferred');
var postAction = require('./postAction');
var filter = require("./filter");   // filter processing
var galaxy = require("./galaxyUtils");
var util = require("./utils");
//var prettyjson = require('prettyjson');   // for debugging

module.exports = {

    /**
     * Initialize the service
     * @param {type} cb
     * @returns {undefined}
     */
    init: function(cb) {
        
        var cb2 = cb;
        // TODO: check that galaxy is running

        galaxy.init(function(history) {

            historyId = history.historyId;
            cb2('success');

        }, function(err) {
            sails.log.error("failed galaxy.init",err);
            cb2(err);
        });
    },
    workflowSubmit: function (req, res) {
        var params = req.allParams();
        params.dataSetPath = params.dataset;
        params.monitorFn = this.monitorWorkflow;
        
        galaxy.workflowSubmit(params,
          function(data,err) {
              if (err !== null) {
                  sails.hooks['jbcore'].resSend(res,err);
              }
              sails.hooks['jbcore'].resSend(res,data);
          });
    },
    getWorkflows: function (req, res) {
          galaxy.galaxyGET("/api/workflows",function(workflows,err) {
              if (err !== null) {
                  return res.send({status:'error',msg:"galaxy GET /api/workflows failed",err:err});
              }
              return res.send(workflows);
          });
    },
    /**
     * Return hits data given hit key
     * 
     * REST: ``GET /jbapi/gethitdetails called``
     * 
     * @param {type} req
     * @param {type} res
     * @param {type} next
     */
    getHitDetails: function (req, res) {
          
          rest_getHitDetails(req,res,function(hitData,err) {
              return res.send(hitData);
          });
    },
    /**
     * returns accession data given accesion number.
     * Utilizes Entrez service
     * 
     * REST: ``GET /jbapi/lookupaccession``
     * 
     * @param {type} req
     * @param {type} res
     * @param {type} next
     */
    lookupAccession: function (req, res) {
        sails.log("JBlast /jbapi/lookupaccession called");

        function accessionLookup(req,res) {
            this.accession.lookup(req,res,function(data,err) {
                res.send(data);
            });
            
        }
        // load accession module only on first time call
        if (typeof this.accession === 'undefined') {
            
            var g = sails.config.globals.jbrowse;
            var accModule = g.accessionModule;

            if (typeof accModule === 'undefined') accModule = "./accessionEntrez";

            this.accession = require(accModule);
            
            this.accession.init(req,res,function() {
                accessionLookup(req,res);
            });
        }
        else {
            accessionLookup(req,res);
        }
    },
    /**
     * Monitor workflow and exit upon completion of the workflow
     * 
     * @param {object} kWorkflowJob
     */
    monitorWorkflow: function(kWorkflowJob){
        var wId = kWorkflowJob.data.workflow.workflow_id;
        sails.log.debug('monitorWorkflow starting, wId',wId);

        var timerloop = setInterval(function(){
            var hId = kWorkflowJob.data.workflow.history_id;

            // TODO: if workflow fails, output will not exist.  Need to handle this.
            var outputs = kWorkflowJob.data.workflow.outputs;    // list of workflow output history ids
            var outputCount = outputs.length;

            sails.log.info ("history",hId);

            // get history entries
            var url = '/api/histories/'+hId+'/contents';
            galaxy.galaxyGET(url,function(hist,err) {

                if (err !== null) {
                    var msg = wId + " monitorWorkflow: failed to get history "+hId;
                    sails.log.error(msg,err);
                    clearInterval(timerloop);
                    kWorkflowJob.kDoneFn(new Error(msg));
                    return;
                }
                // reorg to assoc array
                var hista = {};
                for(var i in hist) hista[hist[i].id] = hist[i];

                // determine aggregate state
                var okCount = 0;
                for(var i in outputs) {
                    // if any are running or uploading, we are active
                    if(hista[outputs[i]].state==='running' || hista[outputs[i]].state==='upload')
                        break;
                    // if something any history error, the whole workflow is in error
                    if(hista[outputs[i]].state==='error') {
                        clearInterval(timerloop);
                        kWorkflowJob.state('failed');
                        kWorkflowJob.save();
                        sails.log.debug(wId,'workflow completed in error');
                        break;
                    }
                    if(hista[outputs[i]].state==='ok')
                        okCount++;
                }
                sails.log.debug(wId,'workflow step',okCount,'of',outputCount);

                kWorkflowJob.progress(okCount,outputCount+1,{workflow_id:wId});

                // complete if all states ok
                if (outputCount === okCount) {
                    clearInterval(timerloop);
                    kWorkflowJob.state('complete');
                    kWorkflowJob.save();
                    sails.log.debug(wId,'workflow completed');
                    setTimeout(function() {
                        postAction.doCompleteAction(kWorkflowJob,hista);            // workflow completed
                    },10);
                }
            });

        },3000);
    }

};

/*
 * Process REST /jbapi/gethitdetails
 */

function rest_getHitDetails(req,res,cb) {
    
    var params = req.allParams();
    
    var asset = params.asset;
    var hitkey = params.hitkey;
    var dataset = params.dataset;
    
    filter.getHitDetails(hitkey, dataset, asset, function(hitData) {
       cb(hitData); 
    });
};

