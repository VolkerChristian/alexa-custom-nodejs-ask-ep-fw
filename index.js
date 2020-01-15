#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const skillEndpoint = express();

skillEndpoint.use(bodyParser.json());

skillEndpoint.get('/', function(req, res) {
    res.send('Alexa Custom Skill Endpoint Framework\n');
});

const skillDirs = source => fs.readdirSync(source, {
    withFileTypes: true
}).reduce((a, c) => {
    if (c.isDirectory() && c.name.endsWith('.skill')) {
        a.push(c.name);
    }
    return a;
}, []);

skillDirs(__dirname).forEach(function (skillDir) {
    var skillName = skillDir.replace('.skill', '');

    var skill = express();

    skill.locals = require(__dirname + '/' + skillDir + '/skill');

    var skillEndpointPath = '/' + skillName;
    if (skill.locals.endpointPath) {
        skillEndpointPath = skill.locals.endpointPath;
    }

    console.log('Registering skill \'' + skillName + '\'');

    skill.post('/', function (req, res) {
        skill.locals.handler(req.body, null, function (err, response) {
            if (err) {
                console.error(err);
                res.status(500).json(seriousErrorSpeech);
            } else {
                res.json(response);
            }
        });
    });

    skillEndpoint.use(skillEndpointPath, skill);

    if (fs.existsSync(__dirname + '/' + skillDir + '/app.js')) {
        console.log('Starting skill application \'' + skillDir + '/app');
        var skillApp = require(__dirname + '/' + skillDir + '/app');
        if (skillApp.expressApp) {
            var expressPath = '/app';
            if (skillApp.expressPath) {
                expressPath = skillApp.expressPath;
            }
            skill.use(expressPath, skillApp.expressApp);
            console.log('Successful started skill application \'' + skillDir + '/app\' on path ' + skillApp.expressApp.path());
        } else if (skillApp.init) {
            skillApp.init(skill);
            console.log('Successful started skill application \'' + skillDir + '/app');
        } else {
            console.log('Successful started skill application \'' + skillDir + '/app');
        }
    }

    console.log('Successful registered skill \'' + skillName + '\' on path ' + skill.path()); // + skillEndpointPath);
});

skillEndpoint.listen(8080, function () {
    console.log('Development endpoint listening on port 8080!');
});

var seriousErrorSpeech = {
    "version": "1.0",
    "response": {
        "outputSpeech": {
            "type": "SSML",
            "ssml": "<speak>Sorry, I had a serious trouble processing your request. Please try again. < /speak>"
        },
        "reprompt": {
            "outputSpeech": {
                "type": "SSML",
                "ssml": "<speak>Sorry, I had a serious error processing your request. Please try again. < /speak>"
            }
        },
        "shouldEndSession": false
    },
    "userAgent": "ask-node/2.7.0 Node/v10.17.0"
};
