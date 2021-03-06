const approot = require('app-root-path');
const tlib = require(approot+'/test/share/test-lib');
const chai = require('chai')
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const server = 'http://localhost:1337';
const expect = chai.expect;
const assert = chai.assert;

describe('integration test', function(){
    this.timeout(240000);
    it('login', function(done) {
        
        //let app = sails.hooks.http.app;
        agent = chai.request.agent(server);

        agent
          .post('/auth/local?next=/jbrowse')
          .set('content-type', 'application/x-www-form-urlencoded; application/json; charset=utf-8')
          .send({
              'identifier':'juser',
              'password':'password',
              'submit':'login'
          })
          .type('form')
          .end((err,res) => {
                expect(res).to.have.status(200);
        
                agent
                  .get('/loginstate')
                  .set('content-type','application/json; charset=utf-8')
                  .end((err,res) => {
                     console.log('/loginstate body',res.body);
                     expect(res).to.have.status(200, '/loginstate status 200');
                     expect(res.body.loginstate).to.equal(true, 'login state true');
                     expect(res.body.user.username).to.equal('juser','login username is juser');

                     done();
                  });
          });
    });
    it('get_workflows api',function(done) {
        let conf = sails.config.globals.jbrowse.services;
        let isGalaxy = (conf.galaxyBlastService && conf.galaxyBlastService.enable===true) ? true : false;

        agent
            .get('/service/exec/get_workflows')
            .set('content-type','application/json; charset=utf-8')
            .end((err,res) => {
                expect(res).to.have.status(200, 'get_blastdata api status 200');
                let data = res.body;
                console.log("***** return data: ",data);
                if (isGalaxy) {
                    console.log('**** galaxyBlastService enabled');
                }
                else {
                    //expect(data[0].id).to.equal('blast-wheat.blast.wf.js','id[0] is not blast-wheat.blast.wf.js');
                    expect(data[1].id).to.equal('demo-job.demo.wf.sh','id[1] is demo-job.demo.wf.sh');
                }
                done();
            });
    });
    it('lookup_accession api',function(done) {
        agent
            .get('/service/exec/lookup_accession/?accession=L08874')
            .end((err,res) => {
                expect(res).to.have.status(200, '/lookup_accession status 200');
                console.log("return data: ",res.body);
                done();
            });
    });
    it('get_hit_details api',function(done) {
        agent
            .get('/service/exec/get_hit_details/?asset=jblast_sample&dataset=sample_data/json/volvox&hitkey=gi-310775-gb-L08874-1-SYNPHSCSKV-1')
            .end((err,res) => {
                expect(res).to.have.status(200, '/lookup_accession status 200');
                let data = res.body;

                console.log("return data: ",data);
                expect(data).to.not.be.undefined;
                expect(data['gi-310775-gb-L08874-1-SYNPHSCSKV-1']).to.not.be.undefined;
                let hit = data['gi-310775-gb-L08874-1-SYNPHSCSKV-1'];
                expect(hit.Hit_num).to.equal('4',"Hit_num is 4");
                expect(hit.Hit_def).to.equal('PhageScript SK cloning vector',"Hit_def is 'PhageScript SK cloning vector'");
                expect(hit.Hit_len).to.equal('7372',"Hit_len is 7372");
                done();
            });
    });
    it('set_filter api', function(done) {
        
        agent
          .post('/service/exec/set_filter')
          .send({
              filterParams: { score: { val: '513' }},
              asset: 'jblast_sample',
              dataset: 'sample_data/json/volvox'
          })
          .end((err,res) => {
            expect(res).to.have.status(200, '/set_filter score status 200');
            expect(res.body.result).to.equal('success',"result is not 'success'");
            console.log('/set_filter-score status',res.status);

                agent
                .post('/service/exec/set_filter')
                .send({
                    filterParams: { gaps: { val: '8.45' }},
                    asset: 'jblast_sample',
                    dataset: 'sample_data/json/volvox'
                })
                .end((err,res) => {
                expect(res).to.have.status(200, '/set_filter gaps status 200');
                expect(res.body.result).to.equal('success',"result is not 'success'");
                console.log("return data: ",res.body);

                    agent
                    .post('/service/exec/set_filter')
                    .send({
                        filterParams: { identity: { val: '83.5' }},
                        asset: 'jblast_sample',
                        dataset: 'sample_data/json/volvox'
                    })
                    .end((err,res) => {
                    expect(res).to.have.status(200, '/set_filter identity status 200');
                    expect(res.body.result).to.equal('success',"result is not 'success'");
                    console.log("return data: ",res.body);

                        agent
                        .post('/service/exec/set_filter')
                        .send({
                            filterParams: { evalue: { val: 5.697149473041933e-40 }},
                            asset: 'jblast_sample',
                            dataset: 'sample_data/json/volvox'
                        })
                        .end((err,res) => {
                        expect(res).to.have.status(200, '/set_filter evalue status 200');
                        expect(res.body.result).to.equal('success',"result is not 'success'");
                        console.log("return data: ",res.body);
                        done();
                        });
                    });
                });
          });
    });
    // this relies on the previous set_filter test
    it('get_blastdata api',function(done) {
        agent
            .get('/service/exec/get_blastdata?asset=jblast_sample&dataset=sample_data/json/volvox')
            .set('content-type','application/json; charset=utf-8')
            .end((err,res) => {
                expect(res).to.have.status(200, 'get_blastdata api status 200');
                let data = res.body;
                console.log("return data: ",data);
                expect(data.result).to.equal('success',"result is not 'success'");
                expect(data.hits).to.equal(792,'number of hits is not 792');
                expect(data.filteredHits).to.equal(22,'filtereed hits is not 22');
                done();
            });
    });
    // this relies on the previous set_filter test
    it('get_trackdata api',function(done) {
        agent
            .get('/service/exec/get_trackdata?asset=jblast_sample&dataset=sample_data/json/volvox')
            .set('content-type','text/plain; charset=utf-8')
            .end((err,res) => {
                expect(res).to.have.status(200, 'get_trackdata status 200');
                console.log("return data: ",res.text);

                /*
                expect(res.text).to.not.be.undefined;
                let lines = res.text.split('\n');
                console.log(">> string length",lines.length);
                expect(lines.length).to.equal(23,"result is not 23");
                */
                done();
            });
    });
    // check certain directories exist.
    it('check directories',function(done) {
        let sh = require("shelljs");
        sh.exec('pwd', function(code, stdout, stderr) {
            console.log('pwd Exit code:', code);
            if (code) {
                console.log('Program stderr:', stderr);
                return done(stderr);
            }
            console.log('Program output:', stdout);

            sh.exec('ls node_modules/blast-ncbi-tools', function(code, stdout, stderr) {
                console.log('ls node_modules/blast-ncbi-tools Exit code:', code);
                if (code) {
                    console.log('Program stderr:', stderr);
                    return done(stderr);
                }
                console.log('Program output:', stdout);
                done();
            });
        });
        //expect(data.result).to.equal('success',"result is not 'success'");
        //expect(data.hits).to.equal(792,'number of hits is not 792');
        //expect(data.filteredHits).to.equal(22,'filtereed hits is not 22');
        //done();
    });

    describe('submit blast test', function(){
        it('should submit blast', function(done) {
            let conf = sails.config.globals.jbrowse.services;
            let isGalaxy = (conf.galaxyBlastService && conf.galaxyBlastService.enable===true) ? true : false;

            let ds = Dataset.Resolve('sample_data/json/volvox');      
            
            let testWorkflow = 'faux-blast.blastv.wf.js';
            let testRegion = '>ctgA ctgA:23755..25049 length=1295\ntcccatagcccgccgaccgggtctgactcaactgtgttttcgctatcccaggctagcacttctattctttgttacgtc\n'+
            'cagtcatagtgttactatagggtaattttagtcatagtagacggccgctttttcgtatggcccgagaccgtccaccgg\nctacccaattaagtcacatccggatcttgggtctagatattcctatcgaaaatagtctcgccgcctcactgcgtagtt\n'+
            'cagggggcgtcacacttgttcgcggcttttcctcatgggatctttacccgatggttgatgcaataaatgtctacaccg\ngactggcgtgtccgagacgactttatacacgtgtgacgagtagatcagatcgtacgaatggtctgtctcacctatccc\n'+
            'agtgggaggatggaaaacactcctgcctaccgggtcgaattatttacgcgtgttacaatatgtaatttagaaaaaggg\nattgctggtcgatgcgtctccaagggattttttatctaaaagcatccttttgggtgtactctgatcgcacgtcgcaga\n'+
            'cagcagtgggttttgacgcagtccgtaggcccacagactcgtttgttgtttattaatcccaggggagcgttgaagcca\ncacctattctgtagctgtttgaaaggtagctagcccggatattactcaaggtgactcccttcagaatcacacgtcgct\n'+
            'ggagtcgccacagggtggcatatacgagtgatagagcaccttactttcgaggtagcggtacattagtgcaacgatgaa\ncccactatagtcttagtgatttcatgttttacttacgcgaaaacgtggggttttgtcaacacgtatacgttgaatgca\n'+
            'catgcctcatcctaaactgatgcactgccacaagtctgaaagagcgacagtctgcaacatagcggaaggttacgccca\nagccagtggtgatcccccataagcttggagggactccccttagcgttggatgtctttgccccagcggcctcggtgtac\n'+
            'gggttctccaccccactatggtttggaactatgaagaggtacggcaacctacccgaggcaccaaatcgtgaacctacg\ncctatatatacggatagcagggtatccattcttaccatgagctcgtaaaccactccgctgaattcgatgggctttggc\n'+
            'gcacatcaccgtttctatcacagatctgtcaacggaatctaacgctatttactcggcgcacacagatcggaaaaccca\nactgtggcgcgggacggactccaggaatcgttacgcgttatcacctt';

            if (isGalaxy) {
                testWorkflow = 'f597429621d6eb2b';
                testRegion = ">ctgA ctgA:44705..47713 (- strand) class=remark length=3009\nacatccaatggcgaacataagcgagttttgttggccccgcaaaaaagcaccgtccattctgt\n"+
                "catcattttccgcgcgacggttcatggtaagcctaaaacacactcgttccacccgccctgag\nttcctaatacgactccacctacaatcgtgtgcacgttttgcgtaaatttagggtctatattc\n"+
                "tttctgacctacgccggaaatgtttacctctagtccataatccaccgtcacctccggcttta\naactagaacccatttattatgttgaatacacgattgtccgggcccaacgatcccctaataaa\n"+
                "cgtggagtcaggtcctttcctcctgcaaggacgaaaaaagtccgggagagttttgggtataa\ngctggatttgggacccgaggcacctgtacacaggacaatagtcgcggaatggacggctgtgt\n"+
                "ttgaacaatgccggtcttcgtgcactgtatgagcagaggtgtgcttatcattacgtcgccca\nataagtccgagagttggaccgcctccttaaataccccgaacttttccttggggtcccgttga\n"+
                "atgtacccctggaatacgccccgtaatccgcgcccggttactgaacaaaaaatcagtgcgtt\nagtcatacatccctctgacggagcagattctgtggagattggaagacggataaacgcacgcg\n"+
                "tcgcccagttaccacaggtcttcctgaatcaagagtaaacagatgtggtggtatgtctccaa\ngtctagtgttgctctcgccttgtctcgttgctgttcctgatatggactcgctgaacagcatg\n"+
                "cgagcggacctcatgtctgggaggctgagaggtcctttaggagtcgcctgatcggttgtcag\ntaccctaacggttggtcagggtgtctagcggtgaggcgaggtaagagtcgtgagccgaaatg\n"+
                "gtgaaggcaacgttataccttgtagctcatatcgaataaacatcgcgaagtaccattacgag\ncccttaggcttaccctatgctcaacccacacttgtagcagacgagcgtccggcagatctcag\n"+
                "actatcatcccgtgtgcggggatctgatcatgaatgttggccttctcttaaggcagcctcgt\naactgataactggggcctgtaagccaagagatgtgtaatgagaagcagtagatagtagagta\n"+
                "actcgcaccaccaccttgagtcatggtctacacaattccccggcaaaagtgtaacagactgc\ngtggcataaacttcaacccccctatgttgtcagagaggtaccaatttactccgattgtatat\n"+
                "agaacaattagtagggagcgaggagagtctgggataaatgaccgtcggagagtcacttctcc\nctgttatgcatagggacatactactatgtttgcgttcctatataccgtgctgtgtgcagcta\n"+
                "caccctcgtagctcaccgtgctccctaggtaacgcgcgaaatgtacaacgggactagctact\ntcgttgggtgacccttgataccccacagactcattaatgcccagagcggacttaagtgggag\n"+
                "acagtaaactcgaggcttgactgtaccgtcgatagaacccagtagacctgggttgtcagtac\nccaggagaatatccgttccttgggccgacccagccacaatggcggttgcacttctgtacaag\n"+
                "gttgcctcaccatcgcttggagtaaagcataaggttgttgcatcggaatcgtcctacctcta\nagttcgaggccccgccacgatacgcaggacacacatagtccagtgatgctcgacccaaaaaa\n"+
                "aaacatcccacaaacacccttcttaaatacccaacaaaaccaatccaaagtccgaactgacc\ngaaccgaaactaaaacaaaagcaggttctaatctcatcgggacagccaaccatctcccgcaa\n"+
                "tttaaaaaaaaccatgtcgcgcaaatcttgtcctgcccccttgtactccatgcgacccccgt\naaacacatagcccctgttccgctttatcagggaaacttacctccaaaacacatacacgcttg\n"+
                "accgtaacgcgcgttggtttcgctcagcacgtacattccgcgatacccgctcttcgttttcc\nttcttccgacacttcgcgtttccccgaagctaaaacgggctcctttagttccgataagtctc\n"+
                "acgcacctgacccaaaaaactgattggtgatgtcacgtagtgcaatcgcctgatgacgtttc\ntcgcccttgacgtgcagtcaacgttctttatagtgacctctgtcccaaaactgaacacactc\n"+
                "aaaccctatctcggactatgctttgatttatagggcatttgcccgattcggaatccacatca\ncaacaggaatttcgccctgctgggcaaaccccgcgtgtacgcttgctgcaactctctcagcc\n"+
                "cagccggtgagggcaatcagctgtgcccgtctcactgttgagagaaataaccacctgcggca\ncaatacgcaaaaccgcatctccccgcgcgatgaccgatcattaaatgcagctgtcacgacag\n"+
                "tttccccgactgaaaagcggcagtgagcgcaaacgcaaattaatgtgagttagctcactcat\nacgccaccccaggctctacactgtatgcttccggctcgtatgttgtgtgcaatgtgagcgca\n"+
                "taacaatttcacacagcaaacagctatgaccatgattacgccaagcttgcatgcctgcaggt\ncgactctagaggatctggctgggtcatttattgtcctgagcacccaagaagatggccaaatt\n"+
                "gtgggagatgactgagtagaccaggactctttggggaaaggccagaacctagggtcatctgg\naaggtgttaggctagatcaacccctagacatttctacaccccctcaccacacaacacaacca\n"+
                "cacccccaagcagtagttatataattattcagtatacaaattgtttatttaatgtctatgtt\nagtcagagttctcaaaagaaacaacttatagga";
            }

            agent
            .post('/job/submit')
            .send({
                'service': 'jblast',
                'dataset':ds.path,
                'region': testRegion,
                'workflow':testWorkflow,
                'trackData': {
                    'testtrack':true
                }
            })
            .end((err,res) => {
                    console.log('/job/submit status',res.status);
                    expect(res).to.have.status(200);
                    console.log('/job/submit body',res.body);
                    let jobId = res.body.jobId;
                    console.log("Job id=",jobId);
                    
                    tlib.waitForJobComplete(jobId,function(complete,data){
                        
                        expect(complete).to.equal(true);
                        expect(data.state).to.equal('complete','job should be completed');
                        
                        expect(data.data.track,"should have a result track").to.not.be.undefined;

                        let trackLabel = data.data.track.label;
                        let lkey = trackLabel+'|'+ds.id;
                        console.log("lkey = ",lkey);
                        
                        //done();
                        
                        agent.get("/track/get?lkey="+lkey)
                        .set('content-type','application/json; charset=utf-8')
                        .end((err,res,body) => {
                            let trackData = res.body[0];
                            console.log("track data",trackData);
                            
                            expect(res).to.have.status(200,'/track/get status 200');
                            expect(trackData.trackData.jblast).to.equal(1,'the new track jblast field should be 1');
                            expect(trackData.trackData.label).to.equal(trackLabel,'track label verify '+trackLabel);
                            expect(trackData.lkey).to.equal(trackLabel+'|'+ds.id,'lkey verify'+trackData.lkey);

                            done();
                        });
                        
                    });
            });
        });
    });
});