const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const skillDirs = source => fs.readdirSync(source, {
    withFileTypes: true
}).reduce((a, c) => {
    if (c.isDirectory() && c.name.endsWith('.skill')) {
        a.push(c.name);
    }
    return a;
}, []);

const skillEndpoints = {};

const app = express();
app.use(bodyParser.json());

skillDirs('.').forEach(function(skilldir) {
    skillEndpointName = skilldir.replace('.skill', '');

    console.log('Registering Skillendpoint /' + skillEndpointName);

    skillEndpoints[skillEndpointName] = require('./' + skilldir + '/skill').handler;

    app.post('/' + skillEndpointName, function(req, res) {
        skillEndpointName = req.url.replace(/\//g, '');

        console.log('REQUEST++++ ' + JSON.stringify(skillEndpointName));

        skillEndpoints[skillEndpointName].invoke(req.body)
            .then(function(responseBody) {
                res.json(responseBody);
            })
            .catch (function(error) {
                console.log(error);
                res.status(500).send('Error during the request');
            });

        console.log('RESPONSE++++ ' + JSON.stringify(res.body));
    });
});

app.listen(8080, function() {
    console.log('Development endpoint listening on port 8080!');
});