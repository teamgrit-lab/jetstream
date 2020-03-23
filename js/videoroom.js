var VideoRoom = (function() {
    const STORED_ROOMINFO_HOURS = 1;
    const STORED_ROOMINFO_MINUTES = 1;
    let handler = null;
    let roomID = null;
    let roomSecret = null;
    let creator = false;
    let publisher = false;

    function attachDefault(janus) {
        return new Promise((resolve, reject) => {
            janus.attach({
                plugin: "janus.plugin.videoroom",
                success: function (pluginHandle) {
                    handler = pluginHandle;
                    resolve();
                },
                error: function (error) {
                    console.log(error)
                    alert(error);
                },            
            });   
        })
    }

    function attachPublisher(callbacks) {
        janus.attach({
            plugin: "janus.plugin.videoroom",
            success: function (pluginHandle) {
                console.log("attach success")
                handler = pluginHandle;
                publisher = true;
                joinPublisher(roomID ? roomID : callbacks.roomID);
                if(callbacks.success) callbacks.success();
            },
            error: function (error) {
                console.log(error);
                if(callbacks.error) callbacks.error();
            },
            consentDialog: function (on) {
                // TODO: do we need to do anything here? This function gets called to tell
                // us whether the video/audio consent dialog is currently up
            },
            mediaState: function (medium, on) {
                console.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                if(callbacks.mediaState) callbacks.mediaState(medium, on);
            },
            webrtcState: function (on) {
                console.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                if(callbacks.webrtcState) callbacks.webrtcState(on);
            },
            onmessage: function (msg, jsep) {
                console.log("onmessage",msg)
                if (msg["videoroom"] !== undefined && msg["videoroom"] !== null) {
                    // publisher_handle_msg(msg);
                    if (msg["videoroom"] == "joined") {
                       createOffer(msg, jsep)
                       if(callbacks.onmessage.joined) callbacks.onmessage.joined();
                    } else if(msg["videoroom"] == "slow_link") {
                       if(callbacks.onmessage.slowlink) callbacks.onmessage.slowlink();
                    }                    
                }
                if (jsep !== undefined && jsep !== null) {
                    if(handler) handler.handleRemoteJsep({ jsep: jsep });
                    if(callbacks.onjesp) callbacks.onjesp(jsep);
                }
            },
            onlocalstream: function (stream) {
                console.log("onlocalstream")
                // initPoseNet();
                // publisher_handle_localstream(stream);
                if(callbacks.onlocalstream) callbacks.onlocalstream(stream);
            },
            onremotestream: function (stream) {
                // do nothing
                if(callbacks.onremotestream) callbacks.onremotestream(stream);
            },
            oncleanup: function () {
                // do what now?
                // window.location.reload();
                if(callbacks.oncleanup) callbacks.oncleanup(stream);
            },
        });
    }

    function attachSubscriber(callbacks) {
        janus.attach({
            plugin: "janus.plugin.videoroom",
            success: function (pluginHandle) {
                handler = pluginHandle;
                publisher = false;
                roomID = callbacks.roomID ? callbacks.roomID : roomID;

                handler.send({
                    message: { request: "listparticipants", "room": roomID },
                    success: function (msg) {
                        console.log(msg)
                        if (msg["videoroom"] == "participants" && msg["participants"].length > 0) {
                            const participant = msg["participants"][0].id;
                            joinSubscriber(roomID, participant);
                        } else {
                            // reload in 5 seconds
                            // TODO: something better?
                            // window.setTimeout(function() { window.location.reload(); }, 5000);
                        }
                    },
                });
            },
            error: function (error) {
                alert(error);
            },
            onmessage: function (msg, jsep) {
                console.log(msg)
                console.log(jsep)
                if (msg["videoroom"] !== undefined && msg["videoroom"] !== null)
                    subscriber_handle_msg(msg);
                if (jsep !== undefined && jsep !== null)
                    createAnswer(jsep);
            },
            webrtcState: function (on) {
                console.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onlocalstream: function (stream) {
                // do nothing
            },
            onremotestream: function (stream) {
                console.log(stream)
                if(callbacks.onremotestream) callbacks.onremotestream(stream);
                // subscriber_handle_remotestream(stream);
            },
            oncleanup: function () {
                // do what now?
                // window.location.reload();
            },
        });
    }

    function createOffer(msg, jesp) {
        console.log("create offer")
        handler.createOffer({
            media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
            simulcast: false,
            success: function (jsep) {
                handler.send({
                    message: { "request": "configure", "audio": true, "video": true },
                    jsep: jsep,
                });
            },
            error: function (error) {
                alert("WebRTC error: " + JSON.stringify(error));
            },
        });
    }

    function subscriber_handle_msg(msg) {
        // TODO: this
        console.log("msg:");
        console.log(msg);
    
        if (msg["videoroom"] == "event") {
            if (msg["error_code"] == 428) { // no such feed
                // publisher isn't here yet, so reload the page
                // window.setTimeout(function() {
                //     window.location.reload();
                // }, 1000);
            }
        }
    }
    
    function createAnswer(jsep) {
        // TODO: this
        console.log("jsep:");
        console.log(jsep);
    
        handler.createAnswer({
            jsep: jsep,
            media: { audioSend: false, videoSend: false },
            success: function (jsep) {
                handler.send({ "message": { "request": "start", "room": roomID }, "jsep": jsep });
            },
            error: function (error) {
                alert(error);
            },
        });
    }

    function list(callback) {
        handler.send({
            message: {
                request: "list"
            },
            success: function(res) {
                if(res.videoroom === "success") {
                    if(callback) callback(res.list);
                }
            }
        })
    }

    function create({description, callback}) {
        const secret = Janus.randomString(12);
        handler.send({
            message: {
                request: "create",
                permanent: false,
                videocodec: "h264",
                record: true,
                rec_dir: "/tmp",
                secret,
                is_private: false,
                description
            },
            success: function (msg) {
                creator = true;
                roomID = msg["room"];
                roomSecret = secret;
                storeRoomInfo(roomID, secret);
                if(callback) callback(roomID);
            },
        });
    }

    function destroy(roomID, secret, callback) {
        handler.send({
            message: {
                "request" : "destroy",
                "room" : roomID,
                "secret" : secret
            },
            success: () => {
                removeRoomInfo();
                if(callback) callback()
            }
        })
    }

    function joinPublisher(roomID) {
        publisher = true;
        handler.send({
            message: {
                "request": "join",
                "room": roomID,
                "ptype": "publisher"
            },
        });
    }

    function joinSubscriber(roomID, feed) {
        handler.send({
            message: {
                "request": "join",
                "room": roomID, "ptype":
                "subscriber",
                "feed": feed
            }
        });
    }

    function storeRoomInfo(id, secret) {
        var d = new Date();
        d.setTime(d.getTime() + (STORED_ROOMINFO_MINUTES*60*1000)); // 1 minute
        // d.setTime(d.getTime() + (STORED_ROOMINFO_HOURS*60*60*1000)); // 4hours
        // var expires = d.toUTCString();
        localStorage.setItem(
            "createroom",
            JSON.stringify({
                id: id ? id : roomID,
                secret: secret ? secret : roomSecret,
                expires: d
            })
        ); 
    };

    function restoreRoomInfo() {
        const storedRoomInfo = localStorage.getItem("createroom");

        if(!storedRoomInfo) return null;

        const parsedRoomInfo = JSON.parse(storedRoomInfo);
        const { id, secret, expires } = parsedRoomInfo;

        // expire check
        if(new Date(expires) < new Date()) {
            console.log("Timeout expired");
            destroy(id, secret);
            return null;
        }
        roomID = id;
        roomSecret = secret;

        return parsedRoomInfo;
    }

    function removeRoomInfo() {
        localStorage.removeItem("createroom");
    }

    function changeBitrate(bitrate) {
        handler.send({ message: { request: "configure", bitrate } });
    }

    return {
        attachDefault,
        list,
        create,
        destroy,
        attachPublisher,
        attachSubscriber,
        joinPublisher,
        joinSubscriber,
        storeRoomInfo,
        restoreRoomInfo,
        removeRoomInfo,
        changeBitrate
    }
})();