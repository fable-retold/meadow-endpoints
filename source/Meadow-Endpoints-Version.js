/**
* Meadow Endpoints - Version & Capability Metadata
*
* Builds the diagnostic version map and capability advertisement that the
* Schema endpoint exposes to clients. Clients (e.g. the pict EntityProvider)
* read this to decide whether newer transport routes — such as the body-driven
* POST /1.0/:Entity/Query read — are available on a given deployment.
*
* The map is computed once and memoized; package versions do not change at
* runtime.
*
* @license MIT
*/

// Retold packages whose versions are surfaced for diagnostics. Best-effort:
// any that cannot be resolved is simply omitted from the map. This is the 2.x
// stack — fable here is the 2.x line (a devDependency, resolved transitively at
// runtime via orator/meadow); there is no fable-serviceproviderbase in this era.
var REPORTED_PACKAGES = [ 'meadow', 'orator', 'meadow-filter', 'fable' ];

var _VersionMetadataCache = null;

/**
* Resolve a package's version from its package.json without throwing.
*
* @param {string} pPackageName - The npm package name to resolve.
*
* @return {string|undefined} The version string, or undefined if unresolvable.
*/
var safeResolveVersion = function(pPackageName)
{
	try
	{
		return require(pPackageName + '/package.json').version;
	}
	catch (pError)
	{
		return undefined;
	}
};

/**
* Resolve meadow-endpoints' own version from the package manifest.
*
* @return {string|undefined} The meadow-endpoints version, or undefined.
*/
var resolveOwnVersion = function()
{
	try
	{
		return require('../package.json').version;
	}
	catch (pError)
	{
		return undefined;
	}
};

/**
* Build (and memoize) the version & capability metadata advertised on the
* Schema endpoint.
*
* @return {Object} The version metadata object ({ PackageVersions, Capabilities }).
*/
var getVersionMetadata = function()
{
	if (_VersionMetadataCache)
	{
		return _VersionMetadataCache;
	}

	var tmpPackageVersions = {};

	var tmpOwnVersion = resolveOwnVersion();
	if (tmpOwnVersion)
	{
		tmpPackageVersions['meadow-endpoints'] = tmpOwnVersion;
	}

	for (var i = 0; i < REPORTED_PACKAGES.length; i++)
	{
		var tmpVersion = safeResolveVersion(REPORTED_PACKAGES[i]);
		if (tmpVersion)
		{
			tmpPackageVersions[REPORTED_PACKAGES[i]] = tmpVersion;
		}
	}

	_VersionMetadataCache = (
		{
			PackageVersions: tmpPackageVersions,
			Capabilities:
			{
				// This module ships with the version of meadow-endpoints that
				// serves the POST /:Entity/Query route, so the capability is
				// always advertised here.
				QueryEndpoint: true
			}
		});

	return _VersionMetadataCache;
};

module.exports = { getVersionMetadata: getVersionMetadata };
