#!/usr/bin/env node

//var requestp = require('request-promise');
var fs = require('fs');
var path = require('path');
//var getopt = require('node-getopt');
var util = require('./util.js');
var Finder = ""; //require('fs-finder');
var config = ""; //require('../config.js');


module.exports = {
    getOptions: function() {
        return [
            ['' , 'blastdbpath=PATH' , 'jblast - existing database path'],
            ['' , 'setupworkflows'   , 'jblast - [install|<path>] "install" project wf, or specify .ga file '],
            ['' , 'setuptools'       , 'jblast - setup jblast tools for galaxy'],
            ['' , 'setupdata'        , 'jblast - setup data and samples']
            //['' , 'setuphistory'     , 'setup history']
        ];        
    },
    getHelpText: function() {
        return "";
        
    },
    process: function(opt,path,config) {
        console.log("extended jbutil", opt,path);
        
        if (!this.init(config)) {
            console.log("jblast - failed to initialize");
            return;
        }
        
        var setuptools = opt.options['setuptools'];
        if (typeof setuptools !== 'undefined') {
            exec_setuptools();
        }
        var blastdbpath = opt.options['blastdbpath'];
        if (typeof blastdbpath !== 'undefined') {
            exec_blastdbpath();
        }
        var setupworkflows = opt.options['setupworkflows'];
        if (typeof setupworkflows !== 'undefined') {
            exec_setupworkflows();
        }
        var setuphistory = opt.options['setuphistory'];
        if (typeof setuphistory !== 'undefined') {
            exec_setuphistory();
        }
        var setupdata = opt.options['setupdata'];
        if (typeof setupdata !== 'undefined') {
            exec_setupdata({config:config,srcpath:this.srcpath});
            exec_setuptrack({config:config});
        }
    },
    init: function(config) {
        //console.log("config",config);
        /*
         * get values for --gpath, apikey and gurl; grab from saved globals if necessary
         */
        this.gurl = config.galaxy.galaxyUrl;
        this.gpath = config.galaxy.galaxyPath;
        this.apikey = config.galaxy.galaxyAPIKey;
        /*
         * figure target paths
         * gdataroot is the root of the where galaxy is installed (default: /var/www/galaxy)
         *     if docker this is the docker export directory.
         * gdatapath is galaxy data dir.  For regular installations, this is the same as gdataroot.
         *     if docker, this is /galaxy-central under gdataroot
         */
        this.gdataroot = this.gpath;                      // root of local path of galaxy
        this.gdatapath = this.gpath+"/galaxy-central";    // galaxy data files, if docker
        try {
            // check if gdatapath directory exists
            fs.accessSync(this.gdataroot, fs.F_OK);
        }
        catch(err) {
            console.log(this.gdataroot,'does not exist');
            console.log("Is Galaxy installed?  Is galaxyPath= defined in config.js properly?");
            return 0;   // init failed
        }
        try {
            // check if gdatapath directory exists
            fs.accessSync(this.gdatapath, fs.F_OK);
        }
        catch (err) {
            //console.log(gdatapath,'does not exist');
            this.gdatapath = this.gpath;
        }
        if (this.gdatapath != this.gpath) {
            console.log("Using Galaxy Docker");
        }
        /*
         * figure source path of jblast-galaxy-tools 
         *   (installed with -g option on RHEL: /usr/lib/node_modules/jblast-tools)
         */
        this.srcpath = __dirname+"/../jblast-tools/";
        //console.log("srcpath",srcpath);
        try {
            fs.accessSync(this.srcpath, fs.F_OK);
        }
        catch(err) {
            console.log(this.srcpath,'source path does not exist');
            return 0;   // failed init
        }
        return 1; // successful init
    }
    
};

/*
 * process --setupall
 */
/*
var setupall = opt.options['setupall'];
if (typeof setupall !== 'undefined') {
    exec_setuptools();
    exec_setupworkflows();
    exec_setuphistory();
    exec_setupdata();
    process.exit(0);
}
*/
/*
 * process commands arguments
 */

/*
 * setup sample track
 */
function exec_setuptrack(params) {
    var config = params.config;
    console.log("Setting up sample track...");
    var g = config;//require('../config.js');
    // todo: why can't I access config from here?

    var trackListPath = g.jbrowsePath + g.dataSet[0].dataPath + 'trackList.json';
    var sampleTrackFile = g.jbrowsePath + g.dataSet[0].dataPath;
    sampleTrackFile += g.jblast.blastResultPath+'/sampleTrack.json';
    var dataSet = g.dataSet[0].dataPath;
    
    // read sampleTrack.json file
    var error = 0;
    try {
      var sampleTrackData = fs.readFileSync (sampleTrackFile);
    }
    catch(err){
        console.log("failed read",trackListPath,err);
        error = 1;
    }
    if (error) return;
    
    var sampleTrack = JSON.parse(sampleTrackData);
    
    // read trackList.json
    try {
      var trackListData = fs.readFileSync (trackListPath);
    }
    catch(err) {
        console.log("failed read",trackListPath,err);
        error = 1;
    }
    if (error) return;
    
    var conf = JSON.parse(trackListData);

    // add the JBlast plugin  
    conf.plugins.push("JBlast");

    // check if sample track exists in trackList.json (by checking for the label)
    var hasLabel = 0;
    for(var i in config.tracks) {
        if (config.tracks[i].label===sampleTrack.label) hasLabel=1;
    }

    if (hasLabel) {
        console.log('Sample track already exists');
        return;
    }
    // add the sample track
    conf.tracks.push(sampleTrack);
    
    // write trackList.json
    try {
      fs.writeFileSync(trackListPath,JSON.stringify(conf,null,4));
    }
    catch(err) {
      console.log("failed write",trackListPath,err);
    }
}
/*
 * setup data directory and sample
 */
function exec_setupdata(params) {
    
    var config = params.config;
    var srcpath = params.srcpath;

    console.log("Setting up data directory...");
    console.log('config',config);
    
    var targetdir = config.jbrowsePath+config.dataSet[0].dataPath;
    
    util.checkDir(targetdir+config.jblast.blastResultPath);
    
    //todo: create subdir if it doesn't exist
    
    util.cmd('cp -R -v "'+srcpath+'/jblastdata" "'+targetdir+'"');

}
/*
 * import the package workflows
 */
function exec_setupworkflows() {
    
    console.log("Setting up sample workflow(s)...");
    
    var srcdir = srcpath+'/workflows';

    // get existing workflow list
    var p = util.galaxyGetAsync('/api/workflows')
    .then(function(workflows) {
        //console.log('workflows',workflows);
        // find workflow files
        var files = Finder.from(srcdir).exclude('*.sample').findFiles('*.ga');
        //console.log('files',files);
        for(var i in files) {
            var content = fs.readFileSync(files[i]).toString();
            
            var thisWF = JSON.parse(content);
            var wfName = thisWF.name;
            var found = 0;
            for(var i in workflows) {
                if (workflows[i].name.indexOf(wfName) !== -1) {
                    console.log('workflow already exists: ', workflows[i].name);
                    console.log(workflows[i].url);
                    found = 1;
                }
            }
            if (!found) {
                var params = {'workflow':thisWF};
                //console.log('params',params);
                var p1 = util.galaxyPostAsync('/api/workflows/upload',params)
                .then(function(data){
                    console.log('Workflow imported:',data.name);
                    console.log(data.url);
                    
                    console.log("Restart Galaxy server for changes to take effect.");
                })
                .catch(function(err) {      // todo: not sure why failure not hitting this
                    console.log('Workflow Upload Error',err.message);
                    console.log(err.options.uri);
                });
            }
        }
    }).catch(function(err) {
        console.log('Get Histories',err.message);
        console.log(err.options.uri);
    });
}
/*
 * setup galaxy history given historyName in config.js
 */
function exec_setuphistory() {
    
    console.log("Setting up history...");
    
    var p = util.galaxyGetAsync('/api/histories')
    .then(function(data) {
        p.meexit = 0;       // this is wrong, but it works for now
        console.log("GET /api histories",data);
        var histName = config.galaxy.historyName;
        for(var i in data) {
            if (data[i].name.indexOf(histName) !== -1) {
                console.log('History already exists: ', data[i].name);
                console.log(data[i].url);
                p.meexit = 1;
                return;
            }
        }
        return util.galaxyPostAsync('/api/histories',{name: histName});
    })
    .then(function(result) {
        if (p.meexit) return;
        console.log("POST /api/histories",result)
        console.log("Created History:",result.name);
        console.log(result.url);
        
        console.log("Restart Galaxy server for changes to take effect.");
    })
    .catch(function(err) {
        console.log('Read histories error',err.message);
        console.log(err.options.uri);
    });
}
/*
 * register blast nucleotide databases
 */
function exec_blastdbpath() {

    console.log("Setting BLAST DB path");

    // target directory
    var tooldir = gdatapath+'/tool-data';
    
    var files = Finder.from(tooldir).exclude('*.sample').findFiles('blastdb.loc');
    try {
        // check existance of blastdbpath 
        fs.accessSync(blastdbpath, fs.F_OK);
    }
    catch (err) {
        console.log(blastdbpath,'does not exist');
        process.exit(1);
    }
    console.log('files',files);
    for(var i in files) {
        if(files[i].indexOf('ncbi_blast_plus') > -1) {
            var blastdb_loc = files[i];

            try {
                var content = fs.readFileSync(blastdb_loc).toString();
            }
            catch(err) {
                console.log(blastdb_loc,"error reading file");
                return;
            }
            content += "\n";
            content += "13apr2014-htgs\thtgs 13-Apr-2014\t"+blastdbpath+"/htgs/13apr2014/htgs\n";
            content += "17apr2014-nt\tnt 17-Apr-2014\t"+blastdbpath+"/nt/17apr2014/nt\n";
            content += "20apr2014-wgs\twgs 20-Apr-2014\t"+blastdbpath+"/wgs/20apr2014/wgs\n";
            content += "phiX174\tphiX\t"+blastdbpath+"/phiX/27aug2010/phiX\n";
            
            console.log(content);
            
            console.log("inserted databases",blastdb_loc);
            fs.writeFileSync(blastdb_loc,content);
            
        }
    }
    console.log("Restart Galaxy server for changes to take effect.");
    
}

/*
 * setup tools - 
 */
function exec_setuptools() {
    
    // copy tools to export root.
    util.cmd('cp -R -v "'+srcpath+'/jblasttools" "'+gdataroot+'"');
    
    var shed_conf = gdatapath+'/config/shed_tool_conf.xml.jblast';
    // copy shed_tool_conf.xml file to shed_tool_conf.xml.jblast
    util.cmd('cp -v "'+gdatapath+'/config/shed_tool_conf.xml" "'+shed_conf+'"');
    
    // backup galaxy.ini if any
    //util.cmd('cp -v "'+gdatapath+'/config/galaxy.ini" "'+gdatapath+'/config/galaxy.ini.bak"');
    
    // copy /config stuff  to /config
    util.cmd('cp -R -v "'+srcpath+'/config" "'+gdatapath+'"');
    
    // in shed_tool_conf.xml.jblast replace ../shed_tools with /export/shed_tools 
    try {
        var content = fs.readFileSync(shed_conf).toString();
    }
    catch(err) {
        console.log(shed_conf,"error reading file");
        return;
    }
    var content2 = content.replace("../shed_tools", "/export/shed_tools");
    console.log("modifying",shed_conf);
    fs.writeFileSync(shed_conf,content2);
    
    console.log("Restart Galaxy server for changes to take effect.");
}
