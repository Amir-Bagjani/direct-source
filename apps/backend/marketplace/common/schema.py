def add_error_contract(result, generator, request, public):
    result["components"]["schemas"]["ErrorEnvelope"] = {
        "type": "object",
        "required": ["code", "message", "fields", "request_id"],
        "properties": {
            "code": {"type": "string"},
            "message": {"type": "string"},
            "fields": {
                "oneOf": [
                    {"type": "object", "additionalProperties": {}},
                    {"type": "array", "items": {}},
                    {"type": "string"},
                ]
            },
            "request_id": {"type": "string"},
        },
    }
    for path in result["paths"].values():
        for method, operation in path.items():
            if method not in ["get", "post", "put", "patch", "delete"]:
                continue
            for code in ["400", "401", "403", "404", "409", "413", "429", "500", "503"]:
                operation["responses"].setdefault(
                    code,
                    {
                        "description": "API error with request correlation ID",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                            }
                        },
                    },
                )
    return result
