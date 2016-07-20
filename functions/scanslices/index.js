require('node-babel')();

const dotenv = require('dotenv').config();

const debug = require('debug')('scan-the-slices:main.js');
const AWS = require("aws-sdk");
const argv = require('yargs').argv;
const fs = require('fs');
const tmpPath = process.env.TMPPATH || '/tmp/';
var getReady = Promise.resolve();

const tesseract = require('./lib/tesseract');

console.log(process.env);

const S3 = new AWS.S3();

function scan(doc, bounds){
	console.log("Attempting scan of:", doc);

	bounds = bounds || false;

	return tesseract.scan(doc, bounds)
		.then(res => {

			console.log("Scan(s) completed:", res);

			const formattedText = res[0].replace(/-\n/g, ' ').replace(/\n/g, ' ');
			var boundedText = undefined;

			if(res.length > 1){

				boundedText = res[1].split('\n');

				boundedText.pop();
				boundedText = boundedText.map(letterData => {
					letterData = letterData.split(' ');
					letterData.pop();
					return {
						'letter' : letterData.shift(),
						'bounds' : letterData
					};
				});

			}

			const results = {
				plain : formattedText,
				bounds : boundedText || []
			};
			
			return results;


		})
		.catch(err => {
			console.log("An error was thrown whilst scanning the document", err);

		})
	;

}

function lambda(event, context, callback){

	console.log(event);

	console.log("Log Group Name", context.logGroupName, "Log Stream Name", context.logStreamName);

	const resource = event.resource;

	tesseract.configure({
		tessPath : process.env.TESSPATH
	});

	if(resource !== undefined){
		// FTDA-1940-0706-0002-003
		// Go and get the image from the URL, store it locally, and then pass it to tesseract

		getReady.then(function(){
			const destination = `${tmpPath}${resource}`;
			const file = fs.createWriteStream(destination);
			console.log(destination)
			S3.getObject({
				Bucket : 'ftlabs-archives-articles',
				Key : resource
			}).createReadStream().pipe(file);

			file.on('error', function(e){
				console.log("error event");
				console.log(e);
			});

			file.on('close', function(e){
				console.log(`File recieved from S3 and written to ${destination}`);
				
				scan(destination, true)
					.then(res => {

						console.log("Tesseract thinks it completed");
						console.log(res);
						// Send the data off to a database
						callback();

					})
					.catch(err => {
						console.log("Tesseract didn't like that...");
						console.log(err);
					})
				;
			});

		});

	} else {
		console.log(`'resource' is undefined`);
	}

}

exports.handle = lambda;