#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const util = require('util');

const skillEndpoint = express();

skillEndpoint.use(bodyParser.json());

skillEndpoint.get('/', function (req, res) {
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

var skillEndpointListener = skillEndpoint.listen(8080, function () {
    skillDirs(__dirname).forEach(function (skillDir) {
        var skillName = skillDir.replace('.skill', '');

        if (fs.existsSync(__dirname + '/' + skillDir + '/skill.js')) {
            var skill = require(__dirname + '/' + skillDir + '/skill');

            var logLine = 'Skill \'' + skill.name + '\' from ' + skillDir;
            console.log(logLine);
            console.log("=".repeat(logLine.length));

            var skillApp = express();
            skillApp.locals.handler = skill.handler;

            var skillEndpointPath = '/' + skillName;
            if (skill.endpointPath) {
                skillEndpointPath = skill.endpointPath;
            }

            skillEndpoint.use(skillEndpointPath, skillApp);

            skillApp.post('/handler', function (req, res) {
                skillApp.locals.handler(req.body, null, function (err, response) {
                    if (err) {
                        console.error(err);
                        res.status(500).json(seriousErrorSpeech);
                    } else {
                        res.json(response);
                    }
                });
            });

            skillApp._router.stack.forEach(function (r) {
                if (r.route && r.route.path) {
                    console.log('[' + skillEndpointListener.address().address + ']:' + skillEndpointListener.address().port + skillEndpointPath + r.route.path);
                }
            });

            if (typeof skill.router === 'function') {
                skillApp.use('/', skill.router);
                skill.router.stack.forEach(function (r) {
                    if (r.route && r.route.path) {
                        console.log('[' + skillEndpointListener.address().address + ']:' + skillEndpointListener.address().port + skillEndpointPath + r.route.path);
                    }
                });
            }

            if (typeof skill.init === 'function') {
                skill.init(skillApp);
            }
        } else {
            console.error('No /' + skillDir + '/skill.js found.');
        }
    });
});

/*
skillEndpoint._router.stack.forEach(function (r) {
    if (r.route && r.route.path) {
        console.log(r.route.path)
    }
});
*/

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
