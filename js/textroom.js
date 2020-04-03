var TextRoom = (function() {
    let handler = null;
    let myid = null;
    let participants = {};
    let transactions = {};
    let attached = false;
    function isAttached() { return attached }
    function attach(callbacks) {
        Janus.log("attach textroom", callbacks.roomID)
        return new Promise( (resolve, reject) => {
            janus.attach(
                {
                    plugin: "janus.plugin.textroom",
                    opaqueId: callbacks.opaqueID,
                    success: function(pluginHandle) {
                        handler = pluginHandle;
                        roomID = callbacks.roomID;
                        attached = true;
                        Janus.log("Plugin attached! (" + handler.getPlugin() + ", id=" + handler.getId() + ")");
                        setup();
                        if(callbacks.success) callbacks.success();
                    },
                    error: function(error) {
                        console.error("  -- Error attaching plugin...", error);
                        alert("Error attaching plugin... " + error);
                    },
                    webrtcState: function(on) {
                        Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                        // $("#videoleft").parent().unblock();
                    },
                    onmessage: function(msg, jsep) {
                        Janus.debug(" ::: Got a message :::");
                        Janus.debug(msg);
                        if(msg["error"] !== undefined && msg["error"] !== null) {
                            alert(msg["error"]);
                        }
                        if(jsep !== undefined && jsep !== null) {
                            // Answer
                            handler.createAnswer(
                                {
                                    jsep: jsep,
                                    media: { audio: false, video: false, data: true },	// We only use datachannels
                                    success: function(jsep) {
                                        Janus.debug("Got SDP!");
                                        Janus.debug(jsep);
                                        var body = { "request": "ack" };
                                        handler.send({"message": body, "jsep": jsep});
                                    },
                                    error: function(error) {
                                        Janus.error("WebRTC error:", error);
                                        alert("WebRTC error... " + JSON.stringify(error));
                                    }
                                });
                        }
                    },
                    ondataopen: function(data) {
                        Janus.log("The DataChannel is available!");
                        resolve();
                    },
                    ondata: function(data) {
                        Janus.debug("We got data from the DataChannel! " + data);
                        //~ $('#datarecv').val(data);
                        var json = JSON.parse(data);
                        var transaction = json["transaction"];
                        if(transactions[transaction]) {
                            // Someone was waiting for this
                            transactions[transaction](json);
                            delete transactions[transaction];
                            return;
                        }
                        var what = json["textroom"];
                        if(what === "message") {
                            // Incoming message: public or private?
                            var msg = json["text"];
                            msg = msg.replace(new RegExp('<', 'g'), '&lt');
                            msg = msg.replace(new RegExp('>', 'g'), '&gt');
                            var from = json["from"];
                            var dateString = getDateString(json["date"]);
                            var whisper = json["whisper"];
                            const userInfo = participants[from];
                            if(whisper === true) {
                                // Private message
                                $('#chat-list').append('<p style="color: purple;">[' + dateString + '] <b>[whisper from ' + participants[from] + ']</b> ' + msg);
                                $('#chat-list-wrapper').get(0).scrollTop = $('#chat-list-wrapper').get(0).scrollHeight;
                            } else {
                                if(from === myid) {
                                    $('#chat-list').append(`
                                    <li class="chat-msg me">
                                        <div class="msg-container">
                                            <div class="d-name">${userInfo.displayName}</div>
                                            <div class="msg">${msg}</div>
                                        </div>
                                        <div class="img-container">
                                            <img src="img/profile/${userInfo.charIndex}.png">
                                        </div>
                                    </li>
                                    `)
                                } else {
                                    $('#chat-list').append(`
                                    <li class="chat-msg">
                                        <div class="img-container">
                                            <img src="img/profile/${userInfo.charIndex}.png">
                                        </div>
                                        <div class="msg-container">
                                            <div class="d-name">${userInfo.displayName}</div>
                                            <div class="msg">${msg}</div>
                                        </div>
                                    </li>
                                    `)
                                }
                                // $('#chat-list').append('<p>[' + dateString + '] <b>' + participants[from] + ':</b> ' + msg);
                                $('#chat-list-wrapper').get(0).scrollTop = $('#chat-list-wrapper').get(0).scrollHeight;
                            }
                        } else if(what === "announcement") {
                            // Room announcement
                            var msg = json["text"];
                            msg = msg.replace(new RegExp('<', 'g'), '&lt');
                            msg = msg.replace(new RegExp('>', 'g'), '&gt');
                            var dateString = getDateString(json["date"]);
                            $('#chat-list').append('<p style="color: purple;">[' + dateString + '] <i>' + msg + '</i>');
                            $('#chat-list').get(0).scrollTop = $('#chat-list').get(0).scrollHeight;
                        } else if(what === "join") {
                            // Somebody joined
                            var username = json["username"];
                            var display = json["display"];
                            participants[username] = display ? JSON.parse(display) : username;
                            if(username !== myid && $('#rp' + username).length === 0) {
                                // Add to the participants list
                                $('#list').append('<li id="rp' + username + '" class="list-group-item">' + participants[username] + '</li>');
                                $('#rp' + username).css('cursor', 'pointer').click(function() {
                                    var username = $(this).attr('id').split("rp")[1];
                                    sendPrivateMsg(username);
                                });
                            }
                            addStatusMessage(participants[username].displayName, "joined");
                            $('#chat-list-wrapper').get(0).scrollTop = $('#chat-list-wrapper').get(0).scrollHeight;
                        } else if(what === "leave") {
                            // Somebody left
                            var username = json["username"];
                            var when = new Date();
                            $('#rp' + username).remove();
                            addStatusMessage(participants[username].displayName, "left");
                            // $('#chat-list').append('<p style="color: ccc;"><small>[' + getDateString() + '] <i>' + participants[username] + ' left</i></p>');
                            $('#chat-list').get(0).scrollTop = $('#chat-list').get(0).scrollHeight;
                            delete participants[username];
                        } else if(what === "kicked") {
                            // Somebody was kicked
                            var username = json["username"];
                            var when = new Date();
                            $('#rp' + username).remove();
                            $('#chat-list').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[username] + ' was kicked from the room</i></p>');
                            $('#chat-list').get(0).scrollTop = $('#chat-list').get(0).scrollHeight;
                            delete participants[username];
                            if(username === myid) {
                                alert("You have been kicked from the room", function() {
                                    window.location.reload();
                                });
                            }
                        } else if(what === "destroyed") {
                            if(json["room"] !== myroom)
                                return;
                            // Room was destroyed, goodbye!
                            Janus.warn("The room has been destroyed!");
                            alert("The room has been destroyed", function() {
                                window.location.reload();
                            });
                        }
                    },
                    oncleanup: function() {
                        Janus.log(" ::: Got a cleanup notification :::");
                        $('#datasend').attr('disabled', true);
                    }
                });
        })

    }

    function setup() {
        handler.send({"message": { "request": "setup" }});
    }

    function create(roomID) {
        return new Promise( (resolve, reject) => {
            const secret = Janus.randomString(12);
            handler.send({
                message: {
                    request: "create",
                    room: roomID,
                    secret,
                    is_private: true,
                    permanent: true
                },
                success: function (msg) {
                    console.log("textroom", msg)
                    creator = true;
                    roomID = msg["room"];
                    // storeRoomInfo(roomID, secret);
                    resolve();
                },
            });
        })
    

    }

    function sendData(data) {
        console.log(data)
        if(data === "") {
            alert('Insert a message to send on the DataChannel');
            return;
        }
        var message = {
            textroom: "message",
            transaction: Janus.randomString(12),
            room: roomID,
            text: data,
        };
        // Note: messages are always acknowledged by default. This means that you'll
        // always receive a confirmation back that the message has been received by the
        // server and forwarded to the recipients. If you do not want this to happen,
        // just add an ack:false property to the message above, and server won't send
        // you a response (meaning you just have to hope it succeeded).
        handler.data({
            text: JSON.stringify(message),
            error: function(reason) { alert(reason); },
            success: function() { $('#datasend').val(''); }
        });
    }

    function join(callbacks) {
console.log(callbacks)
        myid = Janus.randomString(12);
        var transaction = Janus.randomString(12);
        var register = {
            textroom: "join",
            transaction: transaction,
            room: callbacks.roomID,
            username: myid,
            display: JSON.stringify(callbacks.userInfo)
        };

        transactions[transaction] = function(response) {
            if(response["textroom"] === "error") {
                // Something went wrong
                if(response["error_code"] === 417) {
                    // This is a "no such room" error: give a more meaningful description
                    alert(
                        "<p>Apparently room <code>" + myroom + "</code> (the one this demo uses as a test room) " +
                        "does not exist...</p><p>Do you have an updated <code>janus.plugin.textroom.jcfg</code> " +
                        "configuration file? If not, make sure you copy the details of room <code>" + myroom + "</code> " +
                        "from that sample in your current configuration file, then restart Janus and try again."
                    );
                } else {
                    alert(response["error"]);
                }
                return;
            }
            // We're in
            $('#roomjoin').hide();
            $('#room').removeClass('hide').show();
            $('#participant').removeClass('hide').html(UserInfo.displayName).show();
            $('#chat-list').css('height', ($(window).height()-420)+"px");
            $('#datasend').removeAttr('disabled');
            // Any participants already in?
            console.log("Participants:", response.participants);
            if(response.participants && response.participants.length > 0) {
                for(var i in response.participants) {
                    var p = response.participants[i];
                    participants[p.username] = p.display ? JSON.parse(p.display) : p.username;
                    if(p.username !== myid && $('#rp' + p.username).length === 0) {
                        // Add to the participants list
                        $('#list').append('<li id="rp' + p.username + '" class="list-group-item">' + participants[p.username] + '</li>');
                        $('#rp' + p.username).css('cursor', 'pointer').click(function() {
                            var username = $(this).attr('id').split("rp")[1];
                            sendPrivateMsg(username);
                        });
                    }
                    addStatusMessage(participants[p.username].displayName, "joined");
                    // $('#chat-list').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[p.username].displayName + ' joined</i></p>');
                    $('#chat-list').get(0).scrollTop = $('#chat-list').get(0).scrollHeight;
                }
            }
        };
        handler.data({
            text: JSON.stringify(register),
            error: function(reason) {
                alert(reason);
            },
            success: callbacks.success
        });
        
    }


    function sendPrivateMsg(username) {
        var display = participants[username];
        if(!display)
            return;
        prompt("Private message to " + display, function(result) {
            if(result && result !== "") {
                var message = {
                    textroom: "message",
                    transaction: Janus.randomString(12),
                    room: myroom,
                    to: username,
                    text: result
                };
                handler.data({
                    text: JSON.stringify(message),
                    error: function(reason) { alert(reason); },
                    success: function() {
                        $('#chat-list').append('<p style="color: purple;">[' + getDateString() + '] <b>[whisper to ' + display + ']</b> ' + result);
                        $('#chat-list-wrapper').get(0).scrollTop = $('#chat-list-wrapper').get(0).scrollHeight;
                    }
                });
            }
        });
        return;
    }

    // Helper to format times
    function getDateString(jsonDate) {
        var when = new Date();
        if(jsonDate) {
            when = new Date(Date.parse(jsonDate));
        }
        var dateString =
                ("0" + when.getUTCHours()).slice(-2) + ":" +
                ("0" + when.getUTCMinutes()).slice(-2) + ":" +
                ("0" + when.getUTCSeconds()).slice(-2);
        return dateString;
    }

    function addStatusMessage(username, status) {
        $('#chat-list').append(`<li style="color:#ccc;"><small>[${getDateString()}] <i>${username} ${status}</i></small></li>`);
    }

    return {
        attach,
        isAttached,
        create,
        join,
        sendData
    }
})()