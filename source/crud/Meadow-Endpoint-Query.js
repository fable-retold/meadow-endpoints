/**
* Meadow Endpoint - Body-driven Read
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/

/**
* A single POST endpoint that carries the filter, pagination and read-mode
* selection in a JSON body instead of the URI. This sidesteps URI length
* limits hit by complex filters and large IN-lists, while reusing the exact
* GET read handlers (and therefore their authorizers, marshalling and response
* shapes) by mapping the body onto pRequest.params and delegating.
*
* Body envelope:
*   {
*     "Filter": "FBV~Genre~EQ~Books~...",   // meadow-filter string
*     "Begin": 0,
*     "Cap": 250,
*     "ExtraColumns": "ColumnA,ColumnB",    // Lite read
*     "Columns": "ColumnA,ColumnB",         // Distinct read
*     "Lite": true, "Distinct": true, "Count": true
*   }
*
* The read mode is selected by the flags, resolved by precedence:
* Count > Distinct > Lite > Reads (the default). This lets a caller compose a
* read query (filter, pagination, Lite/Distinct shaping) and flip Count on to
* get the count of that same query.
*/
var doReads = require('./Meadow-Endpoint-Reads.js');
var doReadLite = require('./Meadow-Endpoint-ReadLiteList.js');
var doReadDistinct = require('./Meadow-Endpoint-ReadDistinctList.js');
var doCount = require('./Meadow-Endpoint-Count.js');

// Body keys hydrated onto pRequest.params so the delegated GET handlers see
// the same inputs they read from the URI.
var PARAM_KEYS = [ 'Filter', 'Begin', 'Cap', 'ExtraColumns', 'Columns' ];

/**
* Resolve the read mode from the request body flags, by precedence:
* Count > Distinct > Lite > Reads (the default).
*
* @param {Object} pBody - the parsed request body
*
* @return {String} one of 'Count', 'Distinct', 'Lite', 'Reads'
*/
var resolveMode = function(pBody)
{
	if (pBody.Count)
	{
		return 'Count';
	}
	if (pBody.Distinct)
	{
		return 'Distinct';
	}
	if (pBody.Lite)
	{
		return 'Lite';
	}
	return 'Reads';
};

var doAPIQueryEndpoint = function(pRequest, pResponse, fNext)
{
	var tmpBody = (pRequest.body && typeof(pRequest.body) === 'object') ? pRequest.body : {};
	pRequest.params = (pRequest.params && typeof(pRequest.params) === 'object') ? pRequest.params : {};

	for (var i = 0; i < PARAM_KEYS.length; i++)
	{
		if (typeof(tmpBody[PARAM_KEYS[i]]) !== 'undefined')
		{
			pRequest.params[PARAM_KEYS[i]] = tmpBody[PARAM_KEYS[i]];
		}
	}

	switch (resolveMode(tmpBody))
	{
		case 'Count':
			return doCount(pRequest, pResponse, fNext);
		case 'Distinct':
			return doReadDistinct(pRequest, pResponse, fNext);
		case 'Lite':
			return doReadLite(pRequest, pResponse, fNext);
		case 'Reads':
		default:
			return doReads(pRequest, pResponse, fNext);
	}
};

module.exports = doAPIQueryEndpoint;
