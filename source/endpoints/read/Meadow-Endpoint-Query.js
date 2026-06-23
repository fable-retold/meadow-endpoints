/**
* Meadow Endpoint - Body-driven Read
*
* A single POST endpoint that carries the filter, pagination and read-mode
* selection in a JSON body instead of the URI. This sidesteps URI length
* limits hit by complex filters and large IN-lists, while reusing the exact
* GET read handlers (and therefore their behavior hooks, marshalling and
* response shapes) by mapping the body onto pRequest.params and delegating.
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
const doReads = require('./Meadow-Endpoint-Reads.js');
const doReadLite = require('./Meadow-Endpoint-ReadLiteList.js');
const doReadDistinct = require('./Meadow-Endpoint-ReadDistinctList.js');
const doCount = require('../count/Meadow-Endpoint-Count.js');

// Body keys hydrated onto pRequest.params so the delegated GET handlers see
// the same inputs they read from the URI.
const PARAM_KEYS = [ 'Filter', 'Begin', 'Cap', 'ExtraColumns', 'Columns' ];

/**
* Resolve the read mode from the request body flags, by precedence:
* Count > Distinct > Lite > Reads (the default).
*
* @param {Record<string, any>} pBody - the parsed request body
*
* @return {string} one of 'Count', 'Distinct', 'Lite', 'Reads'
*/
const resolveMode = function(pBody)
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

const doAPIEndpointQuery = function(pRequest, pResponse, fNext)
{
	const tmpBody = (pRequest.body && typeof(pRequest.body) === 'object') ? pRequest.body : {};
	pRequest.params = (pRequest.params && typeof(pRequest.params) === 'object') ? pRequest.params : {};

	for (let i = 0; i < PARAM_KEYS.length; i++)
	{
		if (typeof(tmpBody[PARAM_KEYS[i]]) !== 'undefined')
		{
			pRequest.params[PARAM_KEYS[i]] = tmpBody[PARAM_KEYS[i]];
		}
	}

	switch (resolveMode(tmpBody))
	{
		case 'Count':
			return doCount.call(this, pRequest, pResponse, fNext);
		case 'Distinct':
			return doReadDistinct.call(this, pRequest, pResponse, fNext);
		case 'Lite':
			return doReadLite.call(this, pRequest, pResponse, fNext);
		case 'Reads':
		default:
			return doReads.call(this, pRequest, pResponse, fNext);
	}
};

module.exports = doAPIEndpointQuery;
