/*jslint node: true nomen: true plusplus: true */

"use strict";

var exports = {
    // POST /user/sync
    hook_post_user_sync: {
        rank: 1,
        event: function (data) {
            if (data.post.secretkey && data.post.content) {
                process.hook('hook_secretkey_check', {
                    secretkey: data.post.secretkey
                }, function (check) {
                    if (check.returns === true) {

                        process.hook('hook_db_insert', {
                            dbcollection: 'users',
                            dbobject: JSON.parse(data.post.content) 
                        }, function (gotData) {
                            
                            data.returns = "Updated";

                            process.emit('next', data);

                        })

                    } else {
                        process.emit('next', data);
                    }
                });
            }
        }
    },
    hook_get_user_sync: {

        rank: 0,
        event: function (data) {
                       
            var query = {};
        
            var filter;
            
            for(filter in data.get){
                
            query[filter] = data.get[filter];
                
            }
            
            process.hook('hook_db_find', {dbcollection: 'users', dbquery: query}, function (gotData) {

                data.returns = gotData.returns;
                process.emit('next', data);
            });
        }
    },
};

module.exports = exports;