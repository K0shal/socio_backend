// @desc    
// @author  南威
// @date    16/1/2
"use strict";

var should = require('should');
var app = require("../../../index");
var request = require('supertest')(app.listen());

describe('test controller index', function () {
    it('/index/index', function (done) {
        request.get('/index/index')
            .expect(200)
            .expect('1234', done);
    });
    it('/index/index1', function (done) {
        request.get('/index/index1')
            .expect(200)
            .expect('12343', done);
    });

});