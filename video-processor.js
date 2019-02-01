const http = require('http');
const shell = require('shelljs');
const uuidv4 = require('uuid/v4');
const formidable = require('formidable');
var cmds = require('./video-processor-cmds.js');

// cross-origin resource sharing variable
corsVar = process.env.CORSVAR || 'https://dtube.nannal.com';

//Clean Up
shell.rm('-f', ['./fileres240.mp4','./fileres480.mp4','./sprite/*','./upload/*']);

// variable to assure only one upload request happens
var reqhappened = false;

// generated token
const genToken = uuidv4();

http.createServer(function (req, res) {

	res.setHeader('access-control-allow-headers', 'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range')
	res.setHeader('access-control-allow-origin', 'https://dtube.nannal.com');
	res.setHeader('access-control-allow-credentials', 'true');
	res.setHeader('Content-Type','application/json; charset=utf-8');
	// res.setHeader('access-control-max-age','600');
	// res.setHeader('server','Kestrel');

	if (req.url == '/getStatus') {
		res.statusCode = 200;
		res.end('{"version":"0.7.5","currentWaitingInQueue":{"audioCpuToEncode":0,"videoGpuToEncode":0,"audioVideoCpuToEncode":0,"spriteToCreate":0,"ipfsToAdd":0}}');
	};

 // sending encoder progress to user
	if (req.url.match(/\/getProgressByToken.*/)) {
		res.end(JSON.stringify(cmds.encoderResponse));
	};

  // file upload
	if (req.url == '/uploadVideo?videoEncodingFormats=240p,480p,720p,1080p&sprite=true' && !reqhappened) {

		if (req.method === 'OPTIONS'){
				res.statusCode = 204;
				res.end();

			} else {

					res.statusCode = 200;

					reqhappened = true;
					var form = new formidable.IncomingForm();

					//Sane Form options
					form.maxFields = 1
					form.encoding = 'utf-8';
					form.maxFileSize = '4096000000';

					form.parse(req, function (err, fields, files) {
						});

					// file is moved to upload folder and renamed to uuid
					form.on('fileBegin', function (name, file){
			        file.path = "./upload/" + genToken;
			    	});


					form.on('file', function (name, file){

									//frontend needs to know if upload was successful and receive the token
									var successResponse = { success: "", token: ""};

									// check if file is valid
									shell.exec(cmds.ffprobe_cmds.createCmdString(file.path), function(code, stdout, stderr) {

										// code isn't 0 if error occurs
										if (code) {

											// if error, success is false, no token, end process
											successResponse.success = "false";
											res.end(JSON.stringify(successResponse));
											process.exit();

										}

										var fileData = JSON.parse(stdout);

										// if file is valid, success is true and provide token
										successResponse.success = "true";
										successResponse.token = genToken;
										res.end(JSON.stringify(successResponse));

										var videoHeight = fileData.streams[0].height;
										var fileDuration = fileData.format.duration

										// upload source file to ipfs
										cmds.ipfs_cmds.ipfsUpload(file.path, "ipfsAddSourceVideo");

										//create sprite and upload it to ipfs (ipfs upload function is called within sprite function)
										cmds.sprite_cmds.sprite(file.path, fileDuration, "./sprite");

											// videos under 240 res or longer than 10 minutes not encoded
			                if (videoHeight <= 240 || fileDuration > 600){

											// checks if all procedures are done so that finish status can be set
											cmds.checkIfFinished(0);

											// videos between 240 and 480 res get encoded to 240 res
										} else if( videoHeight > 240 && videoHeight <= 480){

												// adds data about encoded video to encoder response
												cmds.addEncodedVideoData(["240p"]);

												cmds.encoder_cmds.encode(cmds.encoder_cmds.changeSettings(file.path, "fileres240.mp4" , 426, 240), 0);
												cmds.checkIfFinished(1);

												// videos over 480 res get encoded to 240 and 480 res
			                } else if( videoHeight > 480) {

												cmds.addEncodedVideoData(["240p","480p"]);

												cmds.encoder_cmds.encode(cmds.encoder_cmds.changeSettings(file.path, "fileres240.mp4" , 426, 240), 0, function(){
													 cmds.encoder_cmds.encode(cmds.encoder_cmds.changeSettings(file.path, "fileres480.mp4" , 854, 480), 1);
												});

												cmds.checkIfFinished(2);
											}

							     	});

							});


						form.on('error', function(err) {
							console.error('Error', err)
				      throw err;
							process.exit();
						});

	  		}


		} else {
			res.end("There's nothing here for you");
		}

}).listen(5000, ()=> {
	console.log("listening on port 5000");
});
