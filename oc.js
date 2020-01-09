'use strict';

var ClientOAuth2 = require('client-oauth2');
var util = require('util');
var mysql = require('mysql');
var request = require('request');
var ICAL = require('ical.js');

var db;

function handleDisconnect() {
    db = mysql.createConnection({
        //        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    db.connect(function onConnect(err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    db.origQuery = db.query;

    db.query = function(sql, values, cb) {
        db.origQuery(sql, values, function(err, result) {
            if (err) {
                console.log('Error: ' + err.stack);
                setTimeout(handleDisconnect, 1000);
            }
            cb(err, result);
        });
    };

    db.on('error', function(error) {
        console.log('On Error: ' + error);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        setTimeout(handleDisconnect(), 1000);
    });
}

handleDisconnect();

var nextcloudAuth = new ClientOAuth2({
    clientId: 'wsdWZ7YHytNP94j3CSh2WFMWlQQ3Dq1Dafbf0Y8YQee3VS55kthpRIInBnAUNbR2',
    clientSecret: '9gJgwVagnH5mev3440kSt6KuCQ5SwKO82zrMucxjwICVgNk0LaHulCU1y7YKHbq7',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'http://calisto.home.vchrist.at:8080/auth/nextcloud/callback',
    scopes: []
});

var express = require('express');
var app = express();

app.get('/auth/nextcloud', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var uri = nextcloudAuth.code.getUri();

    console.log(util.inspect(uri));
    res.redirect(uri);
});

/*
 *
    var post  = {id: 1, title: 'Hello MySQL'};
    var query = connection.query('INSERT INTO posts SET ?', post, function(err, result) {
        // Neat!
    });
    console.log(query.sql); // INSERT INTO posts SET `id` = 1, `title` = 'Hello MySQL'
 */

function insertUser(user, cb) {
    console.log('AUTH: Create account for user ' + user.data.user_id);

    var sql = 'INSERT INTO wastecalendar.oc_user SET ?';

    var ocUser = {
        oc_userid: user.data.user_id,
        oc_accessToken: user.accessToken,
        oc_refreshtoken: user.refreshToken,
        oc_expires: user.expires
    };

    db.query(sql, ocUser, function(err, result) {
        if (err) {
            console.error(err.stack);
            result.statusCode = 500;
            result.end();
            return;
        }
        console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
        if (cb) {
            cb(user);
        }
    });
}

function refreshUser(user, cb) {
    console.log('RT: Refreshing token for user ' + user.data.user_id);

    user.refresh().then(function(updatedUser) {
        console.log('AccessToken: ' + updatedUser.accessToken);
        console.log('RefreshToken: ' + updatedUser.refreshToken);
        console.log('Expires: ' + updatedUser.expires);

        var updatedToken = [
            // new values
            {
                oc_accesstoken: updatedUser.accessToken,
                oc_refreshtoken: updatedUser.refreshToken,
                oc_expires: updatedUser.expires
            },
            // condition
            {
                oc_userid: updatedUser.data.user_id
            }
        ];

        var sql_UpdateToken = 'UPDATE wastecalendar.oc_user SET ? WHERE ?';

        db.query(sql_UpdateToken, updatedToken, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' record updated');

            if (cb) {
                cb(updatedUser);
            }
        });
    });
}

app.get('/auth/nextcloud/callback', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    nextcloudAuth.code.getToken(req.originalUrl).then(function(user) {
        console.log(user);

        var sql = `SELECT * FROM wastecalendar.oc_user WHERE oc_userid = $ {
            db.escape(user.data.user_id)
        }`;

        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
                result.statusCode = 500;
                result.end();
                return;
            }
            console.log(result.affectedRows + ' records found ' + util.inspect(result));

            if (result && result.length) {
                sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = $ {
                    db.escape(user.data.user_id)
                }`;
                db.query(sql, function(err, result) {
                    if (err) {
                        console.error(err.stack);
                        result.statusCode = 500;
                        result.end();
                        return;
                    }
                    console.log(result.affectedRows + ' records updated ' + util.inspect(result));

                    insertUser(user, function(user) {
                        refreshUser(user, function(updatedUser) {
                            return res.send(updatedUser.accessToken);
                        });
                    });
                });
            } else {
                insertUser(user, function(user) {
                    refreshUser(user, function(updatedUser) {
                        return res.send(updatedUser.accessToken);
                    });
                });
            }
        });
    });
});

Date.prototype.toUnixTime = function() {
    return this.getTime() / 1000 | 0;
};

Date.unixTime = function() {
    return new Date().toUnixTime();
};

function processCalendar(user, cb) {
    console.log('PC: Calendar');
    var rec = user.sign({
        url: 'https://cloud.vchrist.at/remote.php/dav/calendars/' + user.data.user_id + '/mllabfuhr/?export' + '&expand=1' + '&start=' + Date.unixTime() + '&end=' + Date.unixTime() + 3600 * 24,
        headers: {
            Accept: 'application/calendar+json'
        }
    });

    request.get(rec, function(error, response, body) {
        var iCalData = JSON.parse(body);
        var comp = new ICAL.Component(iCalData);
        var vevent = comp.getFirstSubcomponent('vevent');
        var event = new ICAL.Event(vevent);

        var str = '';
        if (event.startDate) {
            str = 'Event Summary: ' + event.summary + '\nLocale Start: ' + event.startDate.toJSDate() + '\nLocale End: ' + event.endDate.toJSDate();
        } else {
            str = 'No Event';
        }

        console.log(str);
        cb(str + '\n');
    });
}

app.get('/test', function(req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var sql = "SELECT * FROM wastecalendar.oc_user WHERE oc_userid = 'voc'";

    console.log('PC: Looking for registered user');
    db.query(sql, function(err, result) {
        if (err) {
            console.error(err.stack);
            res.statusCode = 500;
            res.end();
            return;
        }

        result.forEach(function(oc_user) {
            console.log('PC: Processing user ' + oc_user.oc_userid);

            var tokenData = {
                access_token: oc_user.oc_accesstoken,
                refresh_token: oc_user.oc_refreshtoken,
                token_type: 'bearer',
                user_id: oc_user.oc_userid,
                expires_in: oc_user.oc_expires.toUnixTime() - Date.unixTime() - 600
            };

            var user = nextcloudAuth.createToken(tokenData);

            if (user.expired()) {
                refreshUser(user, function(updatedUser) {
                    processCalendar(updatedUser, function(body) {
                        return res.send(body);
                    });
                });
            } else {
                processCalendar(user, function(body) {
                    return res.send(body);
                });
            }
        });
    });
});

function refreshAmzProactiveEndpointToken(cb) {
    var options = {
        'method': 'POST',
        'url': 'https://api.amazon.com/auth/o2/token',
        'headers': {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
            'grant_type': 'client_credentials',
            'client_id': 'amzn1.application-oa2-client.c1494a447d77405883037efdc06baad6',
            'client_secret': '07c7affba53c9d2632186cff30c678d5ed243efc6140436c533f2eac32e8dd11',
            'scope': 'alexa::proactive_events'
        }
    };

    request.post(options, function(error, response, body) {
        cb(error, response, body);
    });
}

const skillid = 'amzn1.ask.skill.5119403b-f6c6-45f8-bd7e-87787e6f5da2';

function getAmzProactiveEndpointAccessToken(amz_skillid, cb) {
    var sql = 'SELECT * FROM wastecalendar.amz_endpoint WHERE amzep_skillid = ' + db.escape(amz_skillid);

    console.log('AMZ: Looking for access-token for skill \'' + amz_skillid + '\'');

    db.query(sql, function(err, result) {
        if (!(result && result.length)) {
            console.log('AMZ: No access token found for skill \'' + amz_skillid + '\' ... retrieving');
            refreshAmzProactiveEndpointToken(function(error, response, body) {
                if (error) {
                    throw new Error(error);
                }
                body = JSON.parse(response.body);
                console.log('AMZ: Got new access token for skill \'' + amz_skillid + '\': ' + body.expires_in + ' - ' + body.access_token);

                var amzEndpointToken = {
                    amzep_skillid: amz_skillid,
                    amzep_accesstoken: body.access_token,
                    amzep_expires: new Date((Date.unixTime() + body.expires_in - 600) * 1000)
                };

                var sql = 'INSERT INTO wastecalendar.amz_endpoint SET ?';
                
                db.query(sql, amzEndpointToken, function(err, result) {
                    if (err) {
                        throw new Error(err);
                    }
                    console.log(result.affectedRows + ' records inserted ');

                    cb({expires: body.expires_in, token: body.access_token});
                });
            });
        } else {
            console.log('AMZ: Access token found for skill \'' + amz_skillid + '\': ' + result[0].amzep_expires + ' - ' + result[0].amzep_accesstoken);
            if (result[0].amzep_expires.toUnixTime() - Date.unixTime() < 600) {
                // Token expired
                console.log('AMZ: Token expired. Refreshing ...');

                refreshAmzProactiveEndpointToken(function(error, response, body) {
                    if (error) {
                        throw new Error(error);
                    }
                    body = JSON.parse(response.body);
                    var expires = new Date((Date.unixTime() + body.expires_in) * 1000);
                    
                    console.log('AMZ: Got new access token for skill \'' + amz_skillid + '\': ' + expires + ' - ' + body.access_token);
                    
                    var amzUpdatedToken = [
                        // new values
                        {
                            amzep_accesstoken: body.access_token,
                            amzep_expires: expires
                        },
                        // condition
                        {
                            amzep_skillid: amz_skillid
                        }
                    ];

                    var sql = 'UPDATE wastecalendar.amz_endpoint SET ? WHERE ?';

                    db.query(sql, amzUpdatedToken, function(err, result) {
                        if (err) {
                            throw new Error(err);
                        }
                        console.log(result.affectedRows + ' records inserted ');

                        cb({expires: expires, token: body.access_token});
                    });
                });
            } else {
                console.log('AMZ: Token valid');
                // Token not expired
                cb({expires: result[0].amzep_expires, token: result[0].amzep_accesstoken});
            }
        }
    });
}

app.get('/amz', function(req, res) {
    getAmzProactiveEndpointAccessToken(skillid, function(accessToken) {
       return res.send('SkillId: ' + skillid + ': ' + '\n\tToken: ' + accessToken.token + '\n\tExpires: ' + accessToken.expires + '\n');
    });
});

app.listen(8080, function() {
    console.log('Nextcloud oauth2 client endpoint listening on port 8080!');
});

/*
let getQueueLength = function() {
    return Math.round(12 * Math.random());
};

// We would like to retrieve the queue length at regular intervals
// this way, we can decide when to make a quick dash over
// at the optimal time

setInterval(function() {
    let queueLength = getQueueLength();

    console.log(`The queue at the McDonald's drive-through is now ${queueLength} cars long.`);

    if (queueLength === 0) {
        console.log('Quick, grab your coat!');
    }

    if (queueLength > 8) {
        return console.log('This is beginning to look impossible!');
    }
}, 3000);
*/