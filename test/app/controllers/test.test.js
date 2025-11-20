// @desc    
// @author  南威
// @date    16/1/2
"use strict";

var should = require('should');
var app = require("../../../index");
var request = require('supertest')(app.listen());

describe('test controller index', function () {
    it('/test/index', function (done) {
        request.get('/test/index')
            .expect(200, done)
        //.expect('1234', done);
    });
});