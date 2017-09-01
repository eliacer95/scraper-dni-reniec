"use strict";
const request = require("request");
const dv      = require("dv");
const async   = require("async");
const fs      = require("fs");
const cheerio = require("cheerio");

const CAPTCHA_URL = "https://cel.reniec.gob.pe/valreg/codigo.do";
const DATA_URL    = "https://cel.reniec.gob.pe/valreg/valreg.do";

function Scraper() {
}

function getCaptcha(sessionRequest , cb) {
	sessionRequest.get(CAPTCHA_URL , function (err , response , body) {
		if ( err ) {
			return cb(err);
		} else {
			return cb(null , sessionRequest , body);
		}
	});
}

function transformCaptcha(sessionRequest , imageBuffer , next) {
	try {
		let image                              = new dv.Image('jpg' , imageBuffer);
		let processed                          = image.threshold(80).subtract(image.threshold(49));
		let tesseract                          = new dv.Tesseract("eng" , processed);
		tesseract[ "tessedit_char_whitelist" ] = "0123456789ABCDEFGHIJKLMNOPQRSÑTUVWXYZ";
		let txt                                = tesseract.findText('plain');
		tesseract.clear();
		txt = txt.trim().replace(" " , "");

		if ( txt.length != 4 ) {
			return next(new Error("Captcha must have 4 characters"));
		}

		return next(null , sessionRequest , txt);
	} catch ( e ) {
		return next(e);
	}
}

function getHtmlPage(dni , sessionRequest , captchaText , next) {
	sessionRequest.post(DATA_URL , {
		form : {
			"accion" : 'buscar' ,
			"nuDni" : dni ,
			"imagen" : captchaText
		}
	} , function (err , response , body) {
		if ( err ) {
			return next(err);
		} else {
			return next(null , body.toString());
		}
	})
}

function parseHtml(html , next) {
	try {
		let $              = cheerio.load(html);
		let c              = $(".style2");
		let data           = c.text().split("-")[ 0 ];
		data               = data.split("\n").filter(function (c) {
			c = c.toString().trim();
			return !!c;
		});
		let result         = {};
		result[ "dni" ]    = data.pop().trim();
		data               = data.map(function (d) {
			return d.toString().trim();
		});
		result[ "nombre" ] = data.join(" ");
		return next(null , result);
	} catch ( e ) {
		return next(e);
	}
}

Scraper.prototype.getData = function (dni , cb) {
	let sessionRequest = request.defaults({
		jar : true ,
		encoding : null
	});

	async.waterfall([
		async.constant(sessionRequest) ,
		getCaptcha ,
		transformCaptcha ,
		function (sessionRequest , captchaText , next) {
			return getHtmlPage(dni , sessionRequest , captchaText , next);
		} ,
		parseHtml
	] , function (err , results) {
		if ( err ) {
			return cb(err);
		} else {
			return cb(null , results);
		}
	});
}

module.exports = new Scraper();