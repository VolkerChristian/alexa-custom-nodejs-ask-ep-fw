#!/usr/bin/node

/*jshint esversion: 8 */
/*jslint node: true */

'use strict';

const express = require('express');
const {
    ExpressAdapter
} = require('ask-sdk-express-adapter');
// const bodyParser = require('body-parser');
const fs = require('fs');
const skillEndpoint = express();

// skillEndpoint.use(bodyParser.json());

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


function loadSkill(skillDir) {
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

        var skillPath = '/handler';
        if (skill.handlerPath) {
            skillPath = skill.skillPath;
        }
        /*
        skillApp.post(handlerPath, function (req, res) {
            skillApp.locals.handler(req.body, null, function (err, response) {
                if (err) {
                    console.error(err);
                    res.status(500).json(seriousErrorSpeech);
                } else {
                    res.json(response);
                }
            });
        });
        */
        const adapter = new ExpressAdapter(skill.skill, true, true);
        
        skillApp.post(skillPath, adapter.getRequestHandlers());

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
        console.log('No /' + skillDir + '/skill.js found.');
    }
}

var skillEndpointListener = skillEndpoint.listen(8080, function (err) {
    if (err) {
        console.error('Can not create server on port ' + skillEndpointListener.address().port)
    } else {
        console.log('Server listening on port ' + skillEndpointListener.address().port);
        loadSkill('.');
        skillDirs(__dirname).forEach(loadSkill);
    }
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
