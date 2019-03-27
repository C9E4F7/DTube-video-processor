const shell = require('shelljs');
const ipfsAPI = require('ipfs-http-client');
const fs = require('fs');
const hbjs = require('handbrake-js')

var ipfsIp = process.env.IPFSIP || '127.0.0.1';
var ipfsPort = process.env.IPFSPORT || '5001';
var ipfsProtocol = process.env.IPFSPROTOCOL || 'http';

var cmds = {

	ffprobe_cmds: {

		createCmdString: (filePath) => {
			str1 = "ffprobe -v error -of default=nw=1 -show_entries stream_tags=rotate:format=size,duration:stream=index,codec_name,pix_fmt,height,width,duration,nb_frames,avg_frame_rate,bit_rate "
			str2 = " -print_format json"

			return str1+filePath+str2
		}

	},
	ipfs_cmds: {

		// uploads file to ipfs, second parameter is the property to update within encoder response
		ipfsUpload: (filePath, prop) => {
			//Connceting to our http api
			const ipfs = ipfsAPI(ipfsIp, ipfsPort, {protocol: ipfsProtocol})
			let videoFile = fs.readFileSync(filePath);
			let testBuffer = new Buffer.from(videoFile);

			ipfs.add(testBuffer, function (err, file) {

				if (err) {
					console.log(err);
					process.exit();
				}
				// updating relevant encoder response fields
				cmds.setObjPropToValue(cmds.encoderResponse, prop+".progress", "100.00%");
				cmds.setObjPropToValue(cmds.encoderResponse, prop+".lastTimeProgress", Date());
				cmds.setObjPropToValue(cmds.encoderResponse, prop+".step", "success");
				cmds.setObjPropToValue(cmds.encoderResponse, prop+".hash", file[0].hash);
				cmds.setObjPropToValue(cmds.encoderResponse, prop+".fileSize", file[0].size);

			});

		}
	},
	sprite_cmds: {

		sprite: (filePath, vidLength, resDir) => {
			var splitCmd = cmds.sprite_cmds.createVideoSplitCmd(filePath, vidLength, resDir);
			var montCmd = cmds.sprite_cmds.createMontageCmd(resDir);
			cmds.sprite_cmds.createSprite(splitCmd, montCmd);
		},

		// splits video into images
		createVideoSplitCmd: (filePath, vidLength, resDir) => {

			if (vidLength > 600) {
				var frameRate = 100/vidLength;
			} else {
				var frameRate = 1;
			}

			return `ffmpeg -y -i `+filePath+ ` -r `+frameRate+` -vf scale=128:72 -f image2 `+resDir+`/img%03d`
		},

		// concatenates all the images together
		createMontageCmd: (resDir) => {
			return `montage -mode concatenate -tile 1x `+resDir+`/* `+resDir+`/sprite.png`
		},

		createSprite: (splitCmd, montCmd) => {

			shell.exec(splitCmd, function(code, stdout, stderr) {

				// code isn't 0 if error occurs
				if (code) {
					console.log(stderr);
					process.exit();
				} else {
					shell.exec(montCmd, function(code, stdout, stderr){
						// code isn't 0 if error occurs
						if (code) {
							console.log(stderr);
							process.exit();
						} else {
							//if no errors, update relevant encoder response fields and upload to ipfs
							cmds.encoderResponse.sprite.spriteCreation.progress = "100.00%";
							cmds.encoderResponse.sprite.spriteCreation.lastTimeProgress = Date();
							cmds.encoderResponse.sprite.spriteCreation.step = "Success";
							cmds.ipfs_cmds.ipfsUpload("./sprite/sprite.png", 'sprite.ipfsAddSprite');
							return stdout;
						}
					});
				}

			});
		}

	},
	encoder_cmds: {

		encoderSettings: {
			input: '',
			output: '',
			maxWidth: 0,
			maxHeight: 0,
			optimize: true,
			format: "av_mp4",
			encoder: "x264",
			rate: "30"
		},

		changeSettings: (filePath, resName, maxWidth, maxHeight) => {
			let settings = cmds.encoder_cmds.encoderSettings;
			settings.input = filePath;
			settings.output = resName;
			settings.maxWidth = maxWidth;
			settings.maxHeight = maxHeight;

			return settings

		},

		encode: (settings, encodedVideoIndex, cb) => {
			var noop = function(){};
			cb = cb || noop;

			let propIpfs = 'encodedVideos[' + String(encodedVideoIndex) + '].ipfsAddEncodeVideo';
			var outputName = settings.output;

			hbjs.spawn(settings)
				.on('error', err => {
					console.log(err);
					cmds.encoderResponse.encodedVideos[encodedVideoIndex].encode.errorMessage = err;
					process.exit();
				})
				.on('progress', progress => {
					cmds.encoderResponse.encodedVideos[encodedVideoIndex].encode.progress = String(progress.percentComplete)+"%";
					cmds.encoderResponse.encodedVideos[encodedVideoIndex].encode.lastTimeProgress = Date();
				})
				.on('complete', () => {
					// when complete, upload to ipfs
					cmds.ipfs_cmds.ipfsUpload(outputName, propIpfs);
					cb();
				});
		}
	},
	encoderResponse: {
		finished: false,
		debugInfo: null,
		sourceAudioCpuEncoding: null,
		sourceVideoGpuEncoding: null,
		ipfsAddSourceVideo: {
			progress: null,
			encodeSize: "source",
			lastTimeProgress: null,
			errorMessage: null,
			step: "Init",
			positionInQueue: null,
			hash: null,
			fileSize: null
		},
		sprite: {
			spriteCreation: {
				progress: null,
				encodeSize: "source",
				lastTimeProgress: null,
				errorMessage: null,
				step: "Init",
				positionInQueue: null
			},
			ipfsAddSprite: {
				progress: null,
				encodeSize: "source",
				lastTimeProgress: null,
				errorMessage: null,
				step: "Init",
				positionInQueue: null,
				hash: null,
				fileSize: null
			}
		},
		encodedVideos: []
	},

	// adds encoded video data fields to encoder response
	addEncodedVideoData: (encodeSize) => {

		var num = encodeSize.length;

		for (let i = 0; i < num; i++) {
			cmds.encoderResponse.encodedVideos.push({
				encode: {
					progress: "Waiting in queue...",
					encodeSize: "",
					lastTimeProgress: null,
					errorMessage: null,
					step: "Waiting",
					positionInQueue: null
				},
					ipfsAddEncodeVideo: {
						progress: null,
						encodeSize: "",
						lastTimeProgress: null,
						errorMessage: null,
						step: "init",
						positionInQueue: null,
						hash: null,
						fileSize: null
					}
			});
			cmds.encoderResponse.encodedVideos[i].encode.encodeSize = encodeSize[i];
			cmds.encoderResponse.encodedVideos[i].ipfsAddEncodeVideo.encodeSize = encodeSize[i];
		}

	},

	// function for setting deep nested object property values
	setObjPropToValue: (obj, path, value) => {
		var i;
		path = path.split(/(?:\.|\[|\])+/);
		for (i = 0; i < path.length - 1; i++)
			obj = obj[path[i]];

		obj[path[i]] = value;
	},

	// checking encoder response values to ensure everything is done before setting finished to true
	checkIfFinished: (numOfEncodedVids) => {

		var func = setInterval(()=>{

			var encodedVidsHash = [];
			for (let i = 0; i < numOfEncodedVids; i++)
			{
				encodedVidsHash.push(cmds.encoderResponse.encodedVideos[i].ipfsAddEncodeVideo.hash);
			}

			if (cmds.encoderResponse.ipfsAddSourceVideo.hash && cmds.encoderResponse.sprite.ipfsAddSprite.hash && encodedVidsHash.every((hash) => {return hash})){
				clearInterval(func);

				// wait before setting finished to true and ending process
				setTimeout(()=>{
					cmds.encoderResponse.finished = true;
				}, 5000);
				setTimeout(()=>{
					process.exit();
				},20000);
			}

		},2000);

	},


}

module.exports = cmds
