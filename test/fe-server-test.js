const expect = require('chai').expect;
var assert = require('assert');

var callWebService = require('../callWebService');

describe('callWebService()', function () {
  it('should call the BE WebService', function () {
    
    // 1. ARRANGE
    var x = 5;
    var y = 1;
    var sum1 = x + y;

    // 2. ACT
    var sum2 = addTwoNumbers(x, y);

    // 3. ASSERT
    expect(sum2).to.be.equal(sum1);

  });
});