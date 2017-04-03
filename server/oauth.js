/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

var forgeSDK = require('forge-apis');

// forge config information, such as client ID and secret
var config = require('./config');

// this end point will logoff the user by destroying the session
// as of now there is no Forge endpoint to invalidate tokens
router.get('/user/logoff', function (req, res) {
    req.session.destroy();
    res.end('/');
});

// return the public token of the current user
// the public token should have a limited scope (read-only)
router.get('/user/token', function (req, res) {
    console.log('Getting user token'); // debug
    var tokenSession = new token(req.session);
    // json returns empty object if the entry values are undefined
    // so let's avoid that
    var tp = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().access_token : "";
    var te = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().expires_in : "";
    console.log('Public token:' + tp);
    res.json({ token: tp, expires_in: te });
});

// return the forge authenticate url
router.get('/user/authenticate', function (req, res) {
    // redirect the user to this page
    var url =
        "https://developer.api.autodesk.com" +
        '/authentication/v1/authorize?response_type=code' +
        '&client_id=' + config.credentials.client_id +
        '&redirect_uri=' + config.callbackURL +
        '&scope=' + config.scopeInternal.join(" ");
    res.end(url);
});

// wait for Autodesk callback (oAuth callback)
router.get('/api/forge/callback/oauth', function (req, res) {
    var code = req.query.code;
    var tokenSession = new token(req.session);

    // first get a full scope token for internal use (server-side)
    var internalAuth = new forgeSDK.AuthClientThreeLegged(config.credentials.client_id, config.credentials.client_secret, config.callbackURL, config.scopeInternal);
    console.log(code);
    internalAuth.getToken(code)
        .then(function (internalCredentials) {

            tokenSession.setInternalCredentials(internalCredentials);
            tokenSession.setInternalOAuth(internalAuth);

            console.log('Internal token (full scope): ' + internalCredentials.access_token); // debug

            // then refresh and get a limited scope token that we can send to the client
            var publicAuth = new forgeSDK.AuthClientThreeLegged(config.credentials.client_id, config.credentials.client_secret, config.callbackURL, config.scopePublic);
            publicAuth.refreshToken(internalCredentials)
                .then(function (publicCredentials) {
                    tokenSession.setPublicCredentials(publicCredentials);
                    tokenSession.setPublicOAuth(publicAuth);

                    console.log('Public token (limited scope): ' + publicCredentials.access_token); // debug
                    res.redirect('/');
                })
                .catch(function (error) {
                    res.end(JSON.stringify(error));
                });
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

module.exports = router;