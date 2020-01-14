/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();

app.use(bodyParser.json());

app.get('/', function(req, res) {
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

skillDirs(__dirname).forEach(function (skilldir) {
    var skillName = skilldir.replace('.skill', '');

    var skill = express();

    skill.locals = require(__dirname + '/' + skilldir + '/skill');

    var skillEndpointPath = '/' + skillName;
    if (skill.locals.endpointPath) {
        skillEndpointPath = skill.locals.endpointPath;
    }

    console.log('Registering skill \'' + skillName + '\'');

    skill.post(skillEndpointPath, function (req, res) {
        skill.locals.handler(req.body, null, function (err, response) {
            if (err) {
                console.error(err);
                res.status(500).json(seriousErrorSpeech);
            } else {
                res.json(response);
            }
        });
    });

    app.use('/', skill);
    
    console.log('Successful registered skill \'' + skillName + '\' on path ' + skill.path());// + skillEndpointPath);
});

app.listen(8080, function () {
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
