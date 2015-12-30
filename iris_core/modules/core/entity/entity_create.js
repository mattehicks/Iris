/**
 * @file Functions and hooks for creating entities
 */

/**
 * Creates an entity and saves it to the database
 *
 * The hook variables should be the entity object, including fields and entity type.
 *
 * @param {string} entityType - the entity type
 * @param {string} [author] - the entity author
 */
iris.modules.entity.registerHook("hook_entity_create", 0, function (thisHook, data) {

  //Not allowed to send _id when creating as it is set automatically

  if (data._id) {

    thisHook.finish(false, iris.error(400, "Can't send an ID or current entity when creating an entity. Try update"));
    return false;

  };

  //Set author and entity type

  if (!data.entityType || !iris.dbCollections[data.entityType]) {

    thisHook.finish(false, iris.error(400, "Needs to have a valid entityType"));
    return false;

  }

  //Set author if not set already

  if (!data.entityAuthor) {

    data.entityAuthor = thisHook.authPass.userid;

  }

  //Check if user has access to create entities

  iris.hook("hook_entity_access_create", thisHook.authPass, null, data).then(function (success) {

    iris.hook("hook_entity_access_create_" + data.entityType, thisHook.authPass, null, data).then(function (successData) {

      validate(data);

    }, function (fail) {

      if (fail === "No such hook exists") {

        validate(data);

      } else {

        thisHook.finish(false, iris.error(403, "Access denied"));
        return false;

      }

    })

  }, function (fail) {

    thisHook.finish(false, iris.error(403, "Access denied"));
    return false;

  });

  //Validate function before passing to presave

  var validate = function (data) {

    //Create dummy body so it can't be edited during validation

    var dummyBody = JSON.parse(JSON.stringify(data));

    //    Object.freeze(dummyBody);

    iris.hook("hook_entity_validate", thisHook.authPass, null, dummyBody).then(function (successData) {

      iris.hook("hook_entity_validate_" + data.entityType, thisHook.authPass, null, dummyBody).then(function (pass) {

        preSave(data);

      }, function (fail) {

        if (fail === "No such hook exists") {

          preSave(data);

        } else {

          thisHook.finish(false, fail);
          return false;

        }

      })

    }, function (fail) {

      thisHook.finish(false, fail);
      return false;

    });

  };

  //Presave function

  var preSave = function (entity) {

    iris.hook("hook_entity_presave", thisHook.authPass, null, entity).then(function (successData) {

      iris.hook("hook_entity_presave_" + data.entityType, thisHook.authPass, null, entity).then(function (pass) {

        create(successData);

      }, function (fail) {

        if (fail === "No such hook exists") {

          create(successData);

        } else {

          thisHook.finish(false, fail);
          return false;

        }

      })

    }, function (fail) {

      thisHook.finish(false, fail);
      return false;

    });

  };

  //Create function and related hooks

  var create = function (preparedEntity) {

    iris.dbCollections[preparedEntity.entityType].count({}, function (err, result) {

      var entity = new iris.dbCollections[preparedEntity.entityType](preparedEntity);

      entity.save(function (err, doc) {

        if (err) {

          console.log(err);
          thisHook.finish(false, "Database error");

        } else if (doc) {

          doc = doc.toObject();

          thisHook.finish(true, doc);

          iris.hook("hook_entity_created", thisHook.authPass, null, doc);

          iris.hook("hook_entity_created_" + data.entityType, thisHook.authPass, null, doc);

          iris.log("info", data.entityType + " created by " + doc.entityAuthor);

        }

      });

    });

  }

});

iris.app.post("/entity/create/:type", function (req, res) {

  req.body.entityType = req.params.type;

  iris.hook("hook_entity_create", req.authPass, null, req.body).then(function (success) {

    res.send(success);

  }, function (fail) {

    res.send(fail);

  });

});

/**
 * Validates an entity
 *
 * This hook returns successfully only if the entity provided passes all the checks implemented by the hook.
 */
iris.modules.entity.registerHook("hook_entity_validate", 0, function (thisHook, data) {

  thisHook.finish(true, data);

});

/**
 * Checks permission for creating an entity
 *
 * This hook returns successfully only if the authPass allows for the entity provided to be created.
 */
iris.modules.entity.registerHook("hook_entity_access_create", 0, function (thisHook, data) {

  if (!iris.modules.auth.globals.checkPermissions(["can create " + data.entityType], thisHook.authPass)) {

    thisHook.finish(false, "Access denied");
    return false;

  }

  thisHook.finish(true, data);

});

/**
 * Entity presave processing
 *
 * Before saving, implementations of this hook may make changes to the entity such as sanitization
 * or addition of extra fields.
 */
iris.modules.entity.registerHook("hook_entity_presave", 0, function (thisHook, data) {

  // Strip out any embed tags

  Object.keys(data).forEach(function (field) {

    if (typeof field === "string") {

      if (data[field].indexOf("[[[") !== -1 || data[field].indexOf("{{") !== -1) {

        data[field] = data[field].split("[[[").join("").split("]]]").join("");
        data[field] = data[field].split("{{").join("").split("}}").join("");

      }

      if (Array.isArray(data[field])) {

        data[field].forEach(function (currentField, index) {

          if (typeof currentField === "string") {

            data[field][index] = data[field][index].split("[[[").join("").split("]]]").join("");
            data[field][index] = data[field][index].split("{{").join("").split("}}").join("");

          }

        })

      }

    }

  })

  thisHook.finish(true, data);

});
