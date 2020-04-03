var VideoRoom = (function() {
    const STORED_ROOMINFO_HOURS = 1;
    const STORED_ROOMINFO_MINUTES = 1;
    const ROLE = {
        PUB: "PUB",
        SUB: "SUB"
    }

    let defaultHandler = null;
    let joinedPublisher = false;
    let publisherHandler = null;
    let feeds = [];
    let opaqueID = null;
    let roomID = null;
    let roomSecret = null;
    
    let creator = false;

    function setRoomID(id) { roomID = id }
 
    function attachPublisher(callbacks) {
        if(callbacks.opaqueID) opaqueID = callbacks.opaqueID;
        return new Promise( (resolve, reject) => {
            janus.attach({
                plugin: "janus.plugin.videoroom",
                opaqueId: opaqueID,
                success: function (pluginHandle) {
                    publisherHandler = pluginHandle;
                    if(callbacks.success) callbacks.success();
                    resolve(true);
                },
                error: function (error) {
                    console.log(error);
                    if(callbacks.error) callbacks.error();
                    reject();
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
                            console.log("joined")
                            joinedPublisher = true;
                            createOffer(msg, jsep)
                        //    if(callbacks.onmessage && callbacks.onmessage.joined) callbacks.onmessage.joined();
                        } else if(msg["videoroom"] === "event") {
                            eventFilterPublisher(msg, callbacks.onremotestream);
                            eventFilterLeave(msg, callbacks.onmessage.leave);
                        } else if(msg["videoroom"] == "slow_link") {
                            if(callbacks.onmessage.slowlink) callbacks.onmessage.slowlink();
                        }
                    }
                    if (jsep !== undefined && jsep !== null) {
                        if(publisherHandler) publisherHandler.handleRemoteJsep({ jsep: jsep });
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
                },
                oncleanup: function () {
                    // do what now?
                    // window.location.reload();
                    if(callbacks.oncleanup) callbacks.oncleanup(stream);
                },
            });
        });
    }

    function newRemoteFeed(callbacks) {
        console.log("newRemoteFeed")
        const {id, display, audio, video} = callbacks;

        // A new feed has been published, create a new plugin handle and attach to it as a subscriber
        var remoteFeed = null;
        janus.attach(
            {
                plugin: "janus.plugin.videoroom",
                opaqueId: opaqueID,
                success: function(pluginHandle) {
                    remoteFeed = pluginHandle;
                    remoteFeed.simulcastStarted = false;
                    Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                    Janus.log("  -- This is a subscriber");
                    // We wait for the plugin to send us an offer
                    var subscribe = { "request": "join", "room": roomID, "ptype": "subscriber", "feed": id };
                    // In case you don't want to receive audio, video or data, even if the
                    // publisher is sending them, set the 'offer_audio', 'offer_video' or
                    // 'offer_data' properties to false (they're true by default), e.g.:
                    // 		subscribe["offer_video"] = false;
                    // For example, if the publisher is VP8 and this is Safari, let's avoid video
                    if(Janus.webRTCAdapter.browserDetails.browser === "safari" &&
                            (video === "vp9" || (video === "vp8" && !Janus.safariVp8))) {
                        if(video)
                            video = video.toUpperCase()
                        toastr.warning("Publisher is using " + video + ", but Safari doesn't support it: disabling video");
                        subscribe["offer_video"] = false;
                    }
                    remoteFeed.videoCodec = video;
                    remoteFeed.send({"message": subscribe});
                },
                error: function(error) {
                    Janus.error("  -- Error attaching plugin...", error);
                    alert("Error attaching plugin... " + error);
                },
                onmessage: function(msg, jsep) {
                    Janus.debug(" ::: Got a message (subscriber) :::");
                    Janus.debug(msg);
                    var event = msg["videoroom"];
                    Janus.debug("Event: " + event);
                    if(msg["error"] !== undefined && msg["error"] !== null) {
                        alert(msg["error"]);
                    } else if(event != undefined && event != null) {
                        if(event === "attached") {
                            // Subscriber created and attached
                            // for(var i=1;i<6;i++) {
                            //     if(feeds[i] === undefined || feeds[i] === null) {
                            //         feeds[i] = remoteFeed;
                            //         remoteFeed.rfindex = i;
                            //         break;
                            //     }
                            // }
                            feeds[id] = remoteFeed;

                            remoteFeed.rfid = msg["id"];
                            remoteFeed.rfdisplay = msg["display"];
                            // if(remoteFeed.spinner === undefined || remoteFeed.spinner === null) {
                            //     var target = document.getElementById('videoremote'+remoteFeed.rfindex);
                            //     remoteFeed.spinner = new Spinner({top:100}).spin(target);
                            // } else {
                            //     remoteFeed.spinner.spin();
                            // }
                            Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
                            // $('#remote'+remoteFeed.rfid).removeClass('hide').html(remoteFeed.rfdisplay).show();
                        } else if(event === "event") {
                            // Check if we got an event on a simulcast-related event from this publisher
                            var substream = msg["substream"];
                            var temporal = msg["temporal"];
                            if((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                                if(!remoteFeed.simulcastStarted) {
                                    remoteFeed.simulcastStarted = true;
                                    // Add some new buttons
                                    addSimulcastButtons(remoteFeed.rfindex, remoteFeed.videoCodec === "vp8" || remoteFeed.videoCodec === "h264");
                                }
                                // We just received notice that there's been a switch, update the buttons
                                updateSimulcastButtons(remoteFeed.rfindex, substream, temporal);
                            }
                        } else {
                            // What has just happened?
                        }
                    }
                    if(jsep !== undefined && jsep !== null) {
                        Janus.debug("Handling SDP as well...");
                        Janus.debug(jsep);
                        // Answer and attach
                        remoteFeed.createAnswer(
                            {
                                jsep: jsep,
                                // Add data:true here if you want to subscribe to datachannels as well
                                // (obviously only works if the publisher offered them in the first place)
                                media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
                                success: function(jsep) {
                                    Janus.debug("Got SDP!");
                                    Janus.debug(jsep);
                                    var body = { "request": "start", "room": myroom };
                                    remoteFeed.send({"message": body, "jsep": jsep});
                                },
                                error: function(error) {
                                    Janus.error("WebRTC error:", error);
                                    alert("WebRTC error... " + JSON.stringify(error));
                                }
                            });
                    }
                },
                webrtcState: function(on) {
                    Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfid + ") is " + (on ? "up" : "down") + " now");
                },
                onlocalstream: function(stream) {
                    // The subscriber stream is recvonly, we don't expect anything here
                },
                onremotestream: function(stream) {
                    Janus.debug("Remote feed #" + remoteFeed.rfid);
                    if(callbacks.onremotestream) callbacks.onremotestream(remoteFeed.rfid, remoteFeed.rfdisplay, stream);
                },
                oncleanup: function() {
                    Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                    // if(remoteFeed.spinner !== undefined && remoteFeed.spinner !== null)
                    //     remoteFeed.spinner.stop();
                    // remoteFeed.spinner = null;
                    // $('#remotevideo'+remoteFeed.rfid).remove();
                    // $('#waitingvideo'+remoteFeed.rfindex).remove();
                    // $('#novideo'+remoteFeed.rfindex).remove();
                    // $('#curbitrate'+remoteFeed.rfindex).remove();
                    // $('#curres'+remoteFeed.rfindex).remove();
                    // if(bitrateTimer[remoteFeed.rfindex] !== null && bitrateTimer[remoteFeed.rfindex] !== null)
                    //     clearInterval(bitrateTimer[remoteFeed.rfindex]);
                    // bitrateTimer[remoteFeed.rfindex] = null;
                    // remoteFeed.simulcastStarted = false;
                    // $('#simulcast'+remoteFeed.rfindex).remove();
                }
            });
    }

    function eventFilterPublisher(msg, onremotestream) {
        if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
            var list = msg["publishers"];
            Janus.debug("Got a list of available publishers/feeds:");
            Janus.debug(list);
            for(var f in list) {
                var id = list[f]["id"];
                var display = list[f]["display"];
                var audio = list[f]["audio_codec"];
                var video = list[f]["video_codec"];
                
                Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                newRemoteFeed({
                    id,
                    display,
                    audio,
                    video,
                    onremotestream
                });
            }
        }
    }

    function eventFilterLeave(msg, leave) {
        if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
            if(leave) leave(msg["unpublished"]);
        }
        if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
            if(leave) leave(msg["leaving"]);
        }
    }

    function createOffer(msg, jesp) {
        console.log("create offer")
        publisherHandler.createOffer({
            media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
            simulcast: false,
            success: function (jsep) {
                publisherHandler.send({
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
    
        subscriberHandler.createAnswer({
            jsep: jsep,
            media: { audioSend: false, videoSend: false },
            success: function (jsep) {
                subscriberHandler.send({ "message": { "request": "start", "room": roomID }, "jsep": jsep });
            },
            error: function (error) {
                alert(error);
            },
        });
    }

    function list(callback) {
        publisherHandler.send({
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

    function create(description) {
        return new Promise( (resolve, reject) => {
            const secret = Janus.randomString(12);
            publisherHandler.send({
                message: {
                    request: "create",
                    permanent: false,
                    videocodec: "h264",
                    // record: true,
                    // rec_dir: "/tmp",
                    secret,
                    is_private: false,
                    notify_joining: true,
                    description
                },
                success: function (msg) {
                    creator = true;
                    roomID = msg["room"];
                    roomSecret = secret;
                    storeRoomInfo(roomID, secret);
                    resolve(roomID);
                },
            });
        })
    }

    function destroy(roomID, secret) {
        return new Promise((resolve, reject) => {
            publisherHandler.send({
                message: {
                    "request" : "destroy",
                    "room" : roomID,
                    "secret" : secret
                },
                success: () => {
                    removeRoomInfo();
                    resolve();
                }
            })
        })
    }

    function joinPublisher(roomID, display) {
        return new Promise( (resolve, reject) => {
            publisherHandler.send({
                message: {
                    request: "join",
                    room: roomID,
                    ptype: "publisher",
                    display
                },
                success: () => {
                    resolve();
                }
            });
        })
    }

    function publish(roomID, display) {
        if(joinedPublisher) {
            createOffer();
        } else {
            joinPublisher(roomID, display);
        }
    }

    function unpublish(success) {
        publisherHandler.send({
            message: {
                request: "unpublish"
            },
            success: success
        })
    }

    function leavePublisher(success) {
        publisherHandler.send({
            message: {
                request: "leave"
            },
            success: success
        })
    }

    function listParticipants(roomID) {
        return new Promise((resolve,reject) => {
            publisherHandler.send({
                message: {request:"listparticipants","room":roomID},
                success: function(msg) {
                    if (msg["videoroom"] == "participants" && msg["participants"].length > 0) {
                        const list = msg["participants"];
                        resolve(list)
   
                        // publisherHandler.send({
                        //     message: {
                        //         "request":"join",
                        //         "room":roomID,
                        //         "ptype":"subscriber",
                        //         "feed":msg["participants"][0].id
                        //     }});
    
                    } else {
                        // reload in 5 seconds
                        // TODO: something better?
                        // window.setTimeout(function() { window.location.reload(); }, 5000);
                    }
                },
            });
        })
    }

    function joinSubscriber(roomID, feed) {
        subscriberHandler.send({
            message: {
                "request": "join",
                "room": roomID,
                "ptype": "subscriber",
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

    function checkCreator(connectRoomID) {
        const roomInfo = restoreRoomInfo();
        if(!roomInfo) return;

        const {id} = roomInfo;
        if(id === connectRoomID) {
            startUpdateRoomExpire();
        }
    }

    function startUpdateRoomExpire() {
        // 방개설자(creator) 이면 localStorage에 저장된 roomInfo의 expire를 15초마다 갱신
        storeRoomInfo();
        tID_roomRefresh = setInterval(storeRoomInfo, 30*1000) // 15sec
    }

    function removeRoomInfo() {
        localStorage.removeItem("createroom");
    }

    function changeBitrate(bitrate) {
        publisherHandler.send({ message: { request: "configure", bitrate } });
    }

    return {
        setRoomID,
        list,
        create,
        destroy,
        attachPublisher,
        joinPublisher,
        publish,
        unpublish,
        leavePublisher,
        joinSubscriber,
        listParticipants,
        newRemoteFeed,
        storeRoomInfo,
        restoreRoomInfo,
        checkCreator,
        removeRoomInfo,
        changeBitrate
    }
})();