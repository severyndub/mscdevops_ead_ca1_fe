var http = require('http');
var url = require('url');
const { parse } = require('querystring');
var fs = require('fs');

//Loading the config fileContents
const config = require('./config/config.json');
const defaultConfig = config.development;
global.gConfig = defaultConfig;

var header = '<!doctype html><html>'+
		     '<head>';
				
var body =  '</head><body><div id="container">' +
				 '<div id="logo">' + global.gConfig.app_name + '</div>' +
				 '<div id="space"></div>' +
				 '<div id="form">' +
				 '<form id="form" action="/" method="post"><center>'+
				 '<label class="control-label">Email</label>' +
				 '<input class="input" type="text" name="email"/><br />'+			
				 '<label class="control-label">Systolic Reading</label>' +
				 '<input class="input" type="number" name="systolic" /><br />'+
				 '<label class="control-label">Diastolic Reading</label>' +
				 '<input class="input" type="number" name="diastolic" /><br />';

var submitButton = '<button class="button button1">Submit</button>' +
				   '</div></form>';
				   
var endBody = '</div></body></html>';				   

				 
function collectFormData(request, callback) {
    const FORM_URLENCODED = 'application/x-www-form-urlencoded';
    if(request.headers['content-type'] === FORM_URLENCODED) {
        let body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        request.on('end', () => {
            callback(parse(body));
        });
    }
    else {
        callback(null);
    }
};

let myDatabaseLayer = (searchEmail) => {
	return new Promise(
		(resolve, reject) => {
			var mongo = require('mongodb');
			var MongoClient = require('mongodb').MongoClient;
			var url = global.gConfig.database;

			MongoClient.connect(url, { useNewUrlParser: true }, function(err, db) {
			  if (err) console.log( err );
			  var dbo = db.db(global.gConfig.database_name);
			   
			  var query = { email: searchEmail };
			  dbo.collection(global.gConfig.database_collection).find( query, { 
											projection: { _id: 0, email: 1, systolic: 1, diastolic: 1, category: 1, date: 1 } 
										}).toArray(function(err, result) {
				if (err) console.log( err );
				let hist_res = result;
				resolve(hist_res);
				db.close();
			  });
			});
		}
	);
};


function css(request, response) {
  if (request.url === '/default.css') {
    response.writeHead(200, {'Content-type' : 'text/css'});
    var fileContents = fs.readFileSync('./public/default.css', {encoding: 'utf8'});
    response.write(fileContents);
  }
}

function isEmptyResult(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function handleError( error, res ) {
	console.log(error); 
	res.write('<center><div id="logo"> Could not retrieve category </div>');
	if(error != null) {
		res.write('<center><div id="logo"> '+ error +' </div>');
	}
	//res.end(endBody);		
}

http.createServer(function (req, res) {
    
	res.writeHead(200, {'Content-Type': 'text/html'});
	

	if (req.method === 'POST') {
		collectFormData(req, result => {
			var request = require('request');
			//todo check these are not blank!
			let url = global.gConfig.webservice +result.systolic+'/'+result.diastolic+'/'+result.email;
			
			// A function that returns a promise to resolve into the data 
			//fetched from the BP Web Service API or an error
			let getBPCat = (url) => {
			  return new Promise(
				(resolve, reject) => {
				  request.get(url, function(error, response, data){
					if (error){ 
						handleError( error, res );	
					}
					else {
						if(!isEmptyResult(data)) {
							let content = JSON.parse(data);
							if(content.error != null) {
								handleError( content.error, res );
							}
							else {
								let cat = content.category;
								resolve(cat);
							}
						}
						else { handleError( "Empty result", res );	}
					}
				  })	  
			   }
			 );
			};
			

			getBPCat(url).then(			
				cat => {  // this forces a wait for 'cat' to be assigned a value				
					res.write('<center><div id="logo">Your blood Pressure category is: ' + cat + '</div>');	
					res.end(endBody);					
				}
			).catch(
				 (error) => { handleError( error, res ); }	
			);				
				

			myDatabaseLayer(result.email).then(			
				hist_res => {  // this forces a wait for 'hist' to be assigned a value
					var fileContents = fs.readFileSync('./public/default.css', {encoding: 'utf8'});
					res.write(header);
					res.write('<style>' + fileContents + '</style>');
					res.write(body);
					res.write(submitButton);
					
					if(!isEmptyResult(hist_res)) {
						res.write('<div id="space"></div>');
						res.write('<div id="logo">Your Previous Readings</div>');
						res.write('<div id="space"></div>');
						res.write('<div id="results">Diastolic | Systolic | Category | Date ');
						res.write('<div id="space"></div>');
						hist_res.forEach(function(item){
						  res.write(item.systolic + ' | ' + item.diastolic + ' | ');
						  res.write(item.category + ' | ' + item.date + '<br/>');
						});
						res.write('</div><div id="space"></div>');
					}
				}
			).catch(
			   (error) => { handleError( error, res ); }	
			);				
		});			
    }
    else {			
		var fileContents = fs.readFileSync('./public/default.css', {encoding: 'utf8'});
		res.write(header);
		res.write('<style>' + fileContents + '</style>');
		res.write(body);
		res.write(submitButton);
		res.end(endBody);
	}
}).listen(global.gConfig.exposedPort);