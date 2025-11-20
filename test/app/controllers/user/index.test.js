// @desc    
// @author  南威
// @date    16/1/2
"use strict";

var should = require('should');
var app = require("../../../../index");
var request = require('supertest')(app.listen());

describe('test controller index', function () {
    it('/user/index/index', function (done) {
        request.get('/user/index/index')
            .expect(200,done)
    });

});