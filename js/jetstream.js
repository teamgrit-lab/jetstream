// this is based on the "videoroomtest" Janus demo
let janus = null;
let sfutest = null;
let remoteFeed = null;
let myroom = null;
let server = null;
let slowlinks = 0;
if (window.location.protocol === 'http:')
    server = "http://" + window.location.hostname + ":8088/janus";
else
    server = "https://" + window.location.hostname + ":8089/janus";

$(document).ready(async function () {
    Janus.init({
        debug: "all", callback: function () {
            if (!Janus.isWebrtcSupported()) {
                alert("No WebRTC support???");
                return;
            }
            if (window.location.hash) {
                try {
                    let joinroom = parseInt(window.location.hash.substr(1));
                    console.log(joinroom)
                    myroom = joinroom;
                    init_subscriber(joinroom);
                } catch (err) {
                    console.log(err);
                    init_publisher();
                };
            } else {
                init_publisher();
            }
        }
    });
});

function init_subscriber(joinroom) {
    $('#subscriber').show();
    $('#substatus').text("Connecting...");

    janus = new Janus({
        server: server,
        // server: "wss://sig0.cojam.tv/enter_room/websocket",
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: ['turn:13.209.250.18:3478?transport=udp'],
                username: 'kurento',
                credential: 'kurento'
            }
        ],
        success: function () {
            $('#substatus').text("Joining stream...");
            start_subscribing(joinroom);
        },
        error: function (error) {
            alert(error);
            // window.location.reload();
        },
        destroyed: function () {
            // window.location.reload();
        },
    });
}

function init_publisher() {
    $('#publisher').show();

    $('#start').one('click', async function () {
        await StreamMixer.init({elementID: 'myvideo', width: 640, height: 360});

        $('#prestart').hide();
        $('#poststart').show();

        janus = new Janus({
            server: server,
            // server: "wss://sig0.cojam.tv/enter_room/websocket",
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: ['turn:13.209.250.18:3478?transport=udp'],
                    username: 'kurento',
                    credential: 'kurento'
                }
            ],
            success: function () {
                start_publishing();
            },
            error: function (error) {
                alert(error);
                // window.location.reload();
            },
            destroyed: function () {
                // window.location.reload();
            },
        });
    });

    $('#video-res').val(1);
    $('#video-res').change(function () {
        const val = parseInt($(this).val());
        console.log(val)
        switch(val) {
            case 1: StreamMixer.setResolution({width: 320, height: 240}); break;
            case 2: StreamMixer.setResolution({width: 640, height: 360}); break;
            case 3: StreamMixer.setResolution({width: 1280, height: 720}); break;
        }
        // sfutest.send({ message: { request: "configure", bitrate: parseInt($(this).val()) * 1000 } });
    });

    $('#bitrate').val(0);
    $('#bitrate').change(function () {
        if (sfutest == null)
            return;
        sfutest.send({ message: { request: "configure", bitrate: parseInt($(this).val()) * 1000 } });
    });

    $('#switch-posenet').val(0);
    $('#switch-posenet').change(function (e) {
        e.preventDefault();
        const val = $(this).prop('checked');
        console.log(val)
        if(val) {
            startPoseNet();
        } else {
            stopPoseNet();
        }
    })
}

function start_subscribing(joinroom) {
    janus.attach({
        plugin: "janus.plugin.videoroom",
        success: function (pluginHandle) {
            remoteFeed = pluginHandle;
            remoteFeed.send({
                message: { request: "listparticipants", "room": joinroom },
                success: function (msg) {
                    if (msg["videoroom"] == "participants" && msg["participants"].length > 0) {
                        remoteFeed.send({ message: { "request": "join", "room": joinroom, "ptype": "subscriber", "feed": msg["participants"][0].id } });
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
            if (msg["videoroom"] !== undefined && msg["videoroom"] !== null)
                subscriber_handle_msg(msg);
            if (jsep !== undefined && jsep !== null)
                subscriber_handle_jsep(jsep);
        },
        webrtcState: function (on) {
            console.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
        },
        onlocalstream: function (stream) {
            // do nothing
        },
        onremotestream: function (stream) {
            console.log(stream)
            subscriber_handle_remotestream(stream);
        },
        oncleanup: function () {
            // do what now?
            // window.location.reload();
        },
    });
}

function start_publishing() {
    janus.attach({
        plugin: "janus.plugin.videoroom",
        success: function (pluginHandle) {
            sfutest = pluginHandle;
            sfutest.send({
                message: {
                    request: "create",
                    permanent: false,
                    videocodec: "h264",
                    record: true,
                    rec_dir: "/tmp",
                    secret: Janus.randomString(12),
                    is_private: true
                },
                success: function (msg) {
                    console.log(msg)
                    myroom = msg["room"];
                    let url = window.location.origin + window.location.pathname + '#' + myroom;
                    $('#loading').hide();
                    $('#streamurl').text(url);
                    $('#streamurl').attr('href', url);
                    $('#show-streamurl').show();
                    sfutest.send({
                        message: { "request": "join", "room": myroom, "ptype": "publisher" },
                    });
                },
            });
        },
        error: function (error) {
            alert(error);
        },
        consentDialog: function (on) {
            // TODO: do we need to do anything here? This function gets called to tell
            // us whether the video/audio consent dialog is currently up
        },
        mediaState: function (medium, on) {
            console.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
        },
        webrtcState: function (on) {
            console.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
        },
        onmessage: function (msg, jsep) {
            if (msg["videoroom"] !== undefined && msg["videoroom"] !== null)
                publisher_handle_msg(msg);
            if (jsep !== undefined && jsep !== null)
                publisher_handle_jsep(jsep);
        },
        onlocalstream: function (stream) {
            initPoseNet();
            publisher_handle_localstream(stream);
        },
        onremotestream: function (stream) {
            // do nothing
        },
        oncleanup: function () {
            // do what now?
            // window.location.reload();
        },
    });
}

function publisher_handle_msg(msg) {
    // TODO: this
    console.log("msg:");
    console.log(msg);

    if (msg["videoroom"] == "joined") {
        publishOwnFeed();
    }

    if (msg["videoroom"] == "slow_link") {
        $('#slowlink').css('opacity', '1.0');
        $('#slowlink').animate({
            opacity: 0,
        }, 2000);
        if (++slowlinks >= 3) {
            $('#slowlink-explain').show();
        }
    }
}

function publisher_handle_jsep(jsep) {
    // TODO: this
    console.log("jsep:");
    console.log(jsep);

    sfutest.handleRemoteJsep({ jsep: jsep });
}

async function publisher_handle_localstream(stream) {
    console.log(stream);
    // Janus.attachMediaStream($('#myvideo').get(0), stream);
    // document.getElementById('myvideo').srcObject = stream;
    console.log("ATTACH MEDIA STREAM");
}

var flipHorizontal = false;
var flagPoseNetInit = false;
var flagPoseNet = false;
var posenet_videoElement = null;
var posenet_canvasElement = null;
var posenet_canvasCtx = null;
// const POINT_COLOR = 'aqua';
// const POINT_RADIUS =  5;
function initPoseNet() {
    const firstObjID = StreamMixer.getIDs()[0];
    posenet_videoElement = StreamMixer.getVideoElement(firstObjID);
    posenet_videoElement.width = 640;
    posenet_videoElement.height = 360;
    // document.body.appendChild(
    //     posenet_videoElement
    // )
    
    posenet_canvasElement = document.getElementById('myvideo');
    posenet_canvasCtx = posenet_canvasElement.getContext("2d");
    flagPoseNetInit = true;
}

function startPoseNet() {
    flagPoseNet = true;
    loadPoseNet();
}

function stopPoseNet() {
    flagPoseNet = false;
}

async function loadPoseNet() {
    if(!flagPoseNet) {
        posenet_canvasCtx.clearRect(0,0,posenet_canvasCtx.width, posenet_canvasCtx.height)
        StreamMixer.clearPoints();
        return
    }

    const net = await posenet.load(
        {
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: 500,
            multiplier: 0.75,
            quantBytes: 2
        }
    )
    const poses = await net.estimatePoses(
        posenet_videoElement,
        {
            flipHorizontal: false,
            decodingMethod: 'single-person'
        }
    );
    const positions = [];
    poses.forEach(({keypoints}) => {
        keypoints.forEach( keypoint => {
            switch(keypoint.part) {
                case "nose":
                case "leftEye":
                case "rightEye":
                case "leftEar":
                case "rightEar":
                    positions.push(keypoint.position);
            }
        })
    })
    StreamMixer.drawPoints(positions);
    
    // console.log(positions)

    window.requestAnimationFrame(loadPoseNet)
}

// function drawPoint(position) {
//     const ctx = posenet_canvasCtx;
//     const {x, y} = position;
//     ctx.beginPath();
//     ctx.arc(x, y, POINT_RADIUS, 0, 2 * Math.PI);
//     ctx.fillStyle = POINT_COLOR;
//     ctx.fill();
// }

function publishOwnFeed() {
    sfutest.createOffer({
        media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
        simulcast: false,
        success: function (jsep) {
            $('#player').show();
            sfutest.send({
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

function subscriber_handle_jsep(jsep) {
    // TODO: this
    console.log("jsep:");
    console.log(jsep);

    remoteFeed.createAnswer({
        jsep: jsep,
        media: { audioSend: false, videoSend: false },
        success: function (jsep) {
            remoteFeed.send({ "message": { "request": "start", "room": myroom }, "jsep": jsep });
        },
        error: function (error) {
            alert(error);
        },
    });
}

function subscriber_handle_remotestream(stream) {
    console.log("subscribe", stream)
    $('#substatus').text('');
    Janus.attachMediaStream($('#remotestream').get(0), stream);
}
