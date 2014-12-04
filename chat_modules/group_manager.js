/*jslint node: true nomen: true*/
"use strict";

/*  Group Manager Module
 *
 *  Provides an essential group management system. Provides hooks for creating and editing groups.
 *  All user interactions take place in the context of a group.
 *
 *  Core hooks:
 *  hook_group_list_users
 *  hook_group_update
 *
 *  API endpoints:
 *  /fetch/group/users
 *  /debug/groups
 *  /group/add
 *  /group/update/addmember
 *  /group/update/name
 */

//var mongoClient = require('mongodb').MongoClient;
var objectID = require('mongodb').ObjectID;

var exports = {
    options: {},
    // TODO: Separate out core functions here as their own hooks to reduce duplication.
    hook_group_list_users: {
        rank: 0,
        event:
            function (data) {
                var groupid = data.groupid,
                    userid = data.userid, // optional: don't return results that don't include this user
                    query = {'_id': objectID(groupid)};

                if (userid) {
                    query = {'_id': objectID(groupid), members: {$elemMatch: {'userid': data.userid.toString()}}};
                }

                if (objectID.isValid(data.groupid)) {
                    process.hook('hook_db_find',
                        {
                            dbcollection: 'groups',
                            dbquery: query
                        },
                        function (gotData) {
                            if (gotData.returns && JSON.parse(gotData.returns)[0]) {
                                data.returns = JSON.parse(gotData.returns)[0].members;
                                process.emit('next', data);
                            } else {
                                data.returns = "ERROR: Nonexistent or inaccessible group ID.";
                                process.emit('next', data);
                            }
                        });
                } else {
                    data.returns = false;
                    process.emit('next', data);
                }
            }
    },
    // GET /fetch/group/users
    hook_get_fetch_group_users: {
        rank: 0,
        event:
            function (data) {
                process.hook('hook_auth_check', {userid: data.get.userid, token: data.get.token}, function (gotData) {
                    if (gotData.returns === true) {
                        var groupid = data.get.groupid;

                        if (objectID.isValid(data.get.groupid)) {
                            process.hook('hook_group_list_users',
                                {
                                    'groupid': groupid,
                                    'userid': data.get.userid
                                },
                                function (gotData) {
                                    if (typeof gotData.returns !== 'string') {
                                        data.returns = JSON.stringify(gotData.returns);
                                    } else {
                                        data.returns = gotData.returns;
                                    }
                                    process.emit('next', data);
                                });
                        } else {
                            data.returns = "ERROR: Invalid group ID.";
                            process.emit('next', data);
                        }
                    } else {
                        data.returns = "ERROR: Authentication failed.";
                        process.emit('next', data);
                    }
                });
            }
    },
    // POST /group/add
    hook_post_group_add: {
        rank: 0,
        event:
            function (data) {
                var url = data.url,
                    post = data.post,
                    groupMembers = [],
                    groupMembersValid = true,
                    currentDate = Date.now(),
                    memberObjects = [];

                process.hook('hook_auth_check', {userid: data.post.userid, token: data.post.token}, function (gotData) {
                    if (gotData.returns === true) {
                        // Validate POSTed data
                        if (post.members) {
                            // Force it to be an array
                            if (post.members.constructor && post.members.constructor !== Array) {
                                groupMembers[0] = post.members;
                            } else {
                                groupMembers = post.members;
                            }

                            // Foreach item, check for a numeric userid (could make this configurable as to what is a valid userid)
                            groupMembers.forEach(function (element, index) {
                                if (isNaN(element) || element === '') {
                                    groupMembersValid = false;
                                }
                            });

                            // If no name supplied, make sure it's blank.
                            if (!post.name) {
                                post.name = '';
                            }

                            // If invalid, return fail
                            if (groupMembersValid !== true) {
                                data.returns = 'ERROR: Invalid user id(s)';
                                // Pass on to the next handler in case it can still salvage this :)
                                process.emit('next', data);
                                return;
                            }

                            groupMembers.forEach(function (element, index) {
                                memberObjects.push({userid: element, joined: currentDate});
                            });

                            // Call database insert hook to insert the new group object
                            process.hook('hook_db_insert', {dbcollection: 'groups', dbobject: {'members': memberObjects, 'name': post.name}}, function (gotData) {
                                data.returns = JSON.stringify(gotData.returns[0]._id).replace(/"/g, ""); // it gets too many quotes from all the stringifying
                                process.emit('next', data);
                            });
                        } else {
                            data.returns = "ERROR: No initial members specified.";
                            process.emit('next', data);
                        }
                    } else {
                        data.returns = "ERROR: Authentication failed.";
                        process.emit('next', data);
                    }
                });
            }
    },
    // GET /debug/groups
    hook_get_debug_groups: {
        rank: 0,
        event:
            function (data) {
                var get = data.get,
                    query = {};

                if (get.userid) {
                    query = {members: {$elemMatch: {'userid': get.userid.toString()}}};
                }
                
                // Call db find hook.
                process.hook('hook_db_find',
                    {
                        dbcollection: 'groups',
                        dbquery: query,
                        callback: function (gotData) {
                            data.returns = gotData.returns;
                            process.nextTick(function () {
                                process.emit('next', data);
                            });
                        }
                    });
            }
    },
    // GET /fetch/groups
    hook_get_fetch_groups: {
        rank: 0,
        event:
            function (data) {
                if (data.get.userid && data.get.token) {
                    process.hook('hook_auth_check', {userid: data.get.userid, token: data.get.token}, function (gotData) {
                        if (gotData.returns === true) {

                            // Call db find hook.
                            process.hook('hook_db_find',
                                {
                                    dbcollection: 'groups',
                                    dbquery: {members: {$elemMatch: {'userid': data.get.userid.toString()}}},
                                    callback: function (gotData) {
                                        data.returns = gotData.returns;
                                        process.nextTick(function () {
                                            process.emit('next', data);
                                        });
                                    }
                                });

                        } else {
                            data.returns = "ERROR: Authentication failed.";
                            process.emit('next', data);
                        }
                    });
                } else {
                    data.returns = "ERROR: Missing userid or token.";
                    process.emit('next', data);
                }
            }
    },
    hook_group_update: {
        rank: 0,
        event:
            function (data) {

                var query;
                if (data.userid) {
                    query = {'_id': objectID(data.groupid), members: {$elemMatch: {'userid': data.userid.toString()}}};
                    console.log(query);
                } else {
                    query = {'_id': objectID(data.groupid)};
                }

                switch (data.action) {

                case 'addmember':
                    process.hook('hook_db_update',
                        {
                            dbcollection: 'groups',
                            dbquery: query,
                            dbupdate: {$push: {members: {'userid': data.members, 'joined': Date.now()}}},
                            dbmulti: true,
                            dbupsert: false
                        }, function (gotData) {
                            data.returns = gotData.returns;
                            process.emit('next', data);
                        });
                    break;

                case 'removemember':
                    process.hook('hook_db_update',
                        {
                            dbcollection: 'groups',
                            dbquery: {'_id': objectID(data.groupid)},
                            dbupdate: {$pull: {members: {'userid': data.members}}},
                            dbmulti: true,
                            dbupsert: false
                        }, function (gotData) {
                            data.returns = gotData.returns;
                            process.emit('next', data);
                        });
                    break;
                case 'name':
                    process.hook('hook_db_update',
                        {
                            dbcollection: 'groups',
                            dbquery: {'_id': objectID(data.groupid)},
                            dbupdate: {$set: {name: data.name}},
                            dbmulti: false,
                            dbupsert: false
                        }, function (gotData) {
                            data.returns = gotData.returns;
                            process.emit('next', data);
                        });
                    break;

                default:
                    data.returns = false;
                    process.emit('next', data);
                }
            }
    },
    // POST /group/update/addmember
    hook_post_group_update_addmember: {
        rank: 0,
        event:
            function (data) {
                var post = data.post;

                if (data.post.members && data.post.groupid) {
                    process.hook('hook_auth_check', {userid: data.post.userid, token: data.post.token}, function (gotData) {
                        if (gotData.returns === true) {
                            process.hook('hook_group_update', {
                                action: 'addmember',
                                userid: post.userid,
                                members: post.members,
                                groupid: post.groupid
                            },
                                function (gotData) {
                                    data.returns = gotData.returns;
                                    process.emit('next', data);
                                });
                        } else {
                            data.returns = "ERROR: Authentication failed.";
                            process.emit('next', data);
                        }
                    });
                } else {
                    data.returns = "ERROR: Invalid userid or groupid.";
                    process.emit('next', data);
                }
            }
    },
    // POST /group/update/removemember
    hook_post_group_update_removemember: {
        rank: 0,
        event:
            function (data) {
                var post = data.post;

                if (post.members && post.groupid) {
                    process.hook('hook_group_update', {action: 'removemember', userid: post.members, groupid: post.groupid}, function (gotData) {
                        data.returns = gotData.returns;
                        process.emit('next', data);
                    });
                } else {
                    data.returns = "ERROR: Invalid userid or groupid.";
                    process.emit('next', data);
                }
            }
    },
    // POST /group/update/name
    hook_post_group_update_name: {
        rank: 0,
        event:
            function (data) {
                var post = data.post;

                if (post.name && post.groupid) {
                    process.hook('hook_group_update', {action: 'name', name: post.name, groupid: post.groupid}, function (gotData) {
                        data.returns = gotData.returns;
                        process.emit('next', data);
                    });
                } else {
                    data.returns = "ERROR: Invalid new name or groupid.";
                    process.emit('next', data);
                }
            }
    }
};

module.exports = exports;
