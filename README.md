# Meadow Endpoints

> **[Read the Meadow-Endpoints Documentation](https://fable-retold.github.io/meadow-endpoints/)** - interactive docs with the full API reference.

> Automagic REST endpoints for CRUD operations on the Retold framework

Meadow Endpoints generates a full suite of RESTful API routes from your Meadow data entities. Define your data model with Meadow, point Meadow Endpoints at it, and you get Create, Read, Update, Delete, Count, Schema, and Validate endpoints -- with authentication hooks, authorization, dynamic filtering, pagination, and behavior injection for customization. The design philosophy is to cover the 99% via configuration; the last 1% is easily hand-craftable.

## Features

- **Automatic Route Generation** - Full CRUD endpoints from a Meadow entity with zero boilerplate
- **Behavior Injection** - Pre/post operation hooks for authentication, authorization, and custom logic
- **Dynamic Filtering** - URL-based filter expressions for flexible querying
- **Pagination** - Built-in Begin/Cap parameters with configurable default limits
- **Bulk Operations** - Batch create, update, and upsert endpoints
- **Schema Endpoints** - Serve JSON Schema, default objects, and validation
- **Controller Architecture** - Extensible controller system with replaceable error handling, logging, and session management
- **Fable Integration** - First-class service in the Fable/Orator ecosystem

## Quick Start

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libMeadow = require('meadow');
const libMeadowEndpoints = require('meadow-endpoints');

const _Fable = new libFable({
	Product: 'MyAPI',
	ProductVersion: '1.0.0',
	ServicePort: 8086
});

// Set up Orator
_Fable.serviceManager.addServiceType('Orator', libOrator);
_Fable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
_Fable.serviceManager.instantiateServiceProvider('Orator');
_Fable.serviceManager.instantiateServiceProvider('OratorServiceServer');

// Create a Meadow DAL for "Book"
const tmpMeadow = libMeadow.new(_Fable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Generate and connect endpoints
const tmpMeadowEndpoints = new libMeadowEndpoints(tmpMeadow);
tmpMeadowEndpoints.connectRoutes(_Fable.Orator.serviceServer);

// Start the server
_Fable.Orator.startService(() =>
{
	console.log('API running on port 8086');
	// GET    /1.0/Book/:IDBook       - Read one
	// GET    /1.0/Book/s/:Begin/:Cap - Read many
	// POST   /1.0/Book               - Create
	// PUT    /1.0/Book               - Update
	// DELETE /1.0/Book/:IDBook       - Delete
	// GET    /1.0/Book/s/Count       - Count
	// GET    /1.0/Book/Schema        - Schema
});
```

## Installation

```bash
npm install meadow-endpoints
```

## How It Works

Meadow Endpoints takes a configured Meadow DAL instance and registers HTTP routes with an Orator service server. Each route follows an async waterfall pattern with behavior injection points for customization.

<!-- bespoke diagram: edit diagrams/how-it-works.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow-endpoints -->
![How It Works](diagrams/how-it-works.svg)

## Generated Routes

### CRUD

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/{ver}/{entity}` | Create a record |
| POST | `/{ver}/{entity}/s` | Bulk create |
| GET | `/{ver}/{entity}/:ID` | Read one record |
| GET | `/{ver}/{entity}/s/:Begin/:Cap` | Read many with pagination |
| GET | `/{ver}/{entity}/s/FilteredTo/:Filter` | Read with filter |
| PUT | `/{ver}/{entity}` | Update a record |
| PUT | `/{ver}/{entity}/Upsert` | Insert or update |
| DELETE | `/{ver}/{entity}/:ID` | Delete a record |
| GET | `/{ver}/{entity}/Undelete/:ID` | Undelete a record |
| GET | `/{ver}/{entity}/s/Count` | Count records |

### Specialized Read

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{ver}/{entity}/Select` | Select list ({Hash, Value} pairs) |
| GET | `/{ver}/{entity}/s/Lite` | Lite list (minimal columns) |
| GET | `/{ver}/{entity}/s/Distinct/:Columns` | Distinct values |
| GET | `/{ver}/{entity}/Max/:Column` | Maximum value |

### Schema

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{ver}/{entity}/Schema` | JSON Schema |
| GET | `/{ver}/{entity}/Schema/New` | Empty default record |
| POST | `/{ver}/{entity}/Schema/Validate` | Validate a record |

## Behavior Injection

Hook into any endpoint's lifecycle for authorization and custom logic:

```javascript
const tmpEndpoints = new libMeadowEndpoints(tmpMeadow);

// Add customer-scoped reads
tmpEndpoints.controller.BehaviorInjection.setBehavior('Reads-QueryConfiguration',
	(pRequest, pRequestState, fCallback) =>
	{
		pRequestState.Query.addFilter('IDCustomer', pRequestState.SessionData.CustomerID);
		return fCallback();
	});
```

### Injection Points

| Point | Phase |
|-------|-------|
| `Create-PreOperation` / `Create-PostOperation` | Before/after creation |
| `Create-QueryConfiguration` | After query built, before execution |
| `Read-PreOperation` / `Read-PostOperation` | Before/after single read |
| `Reads-QueryConfiguration` / `Reads-PostOperation` | Multi-record reads |
| `Update-QueryConfiguration` | After update query built |
| `Delete-PreOperation` / `Delete-PostOperation` | Before/after deletion |
| `Count-QueryConfiguration` | After count query built |

## Dynamic Filtering

```
GET /1.0/Book/s/FilteredTo/Title~JavaScript
GET /1.0/Book/s/FilteredTo/Author=Frank Herbert
GET /1.0/Book/s/FilteredTo/Price>20
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (contains)

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `MeadowEndpointVersion` | string | `"1.0"` | API version prefix |
| `MeadowDefaultMaxCap` | number | `250` | Default pagination limit |
| `MeadowEndpointsSessionDataSource` | string | `"Request"` | Session data source (`Request`, `Header`, `None`) |
| `SendErrorStatusCodes` | boolean | `false` | Set HTTP status codes on errors |

## Testing

```bash
npm test
```

## Documentation

Detailed documentation is available in the `docs/` folder and can be served locally:

```bash
npx docsify-cli serve docs
```

## Related Packages

- [meadow](https://github.com/fable-retold/meadow) - Data access and ORM
- [foxhound](https://github.com/fable-retold/foxhound) - Query DSL for SQL generation
- [orator](https://github.com/fable-retold/orator) - API server abstraction
- [fable](https://github.com/fable-retold/fable) - Application services framework

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/fable-retold/retold/blob/main/docs/contributing.md).
