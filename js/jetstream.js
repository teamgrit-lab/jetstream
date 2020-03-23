// this is based on the "videoroomtest" Janus demo
let janus = null;
let sfutest = null;
let remoteFeed = null;
let roomList = null;
let myroom = null;
let server = null;
let slowlinks = 0;
let tID_roomRefresh = null;

if (window.location.protocol === 'http:')
    server = "http://" + window.location.hostname + ":8088/janus";
else
    server = "https://" + window.location.hostname + ":8089/janus";

$(document).ready(async function () {
    Janus.init({
        debug: "all", callback: async function () {
            if (!Janus.isWebrtcSupported()) {
                alert("No WebRTC support???");
                return;
            }
            janus = await createJanusInstance();

            if (window.location.hash) {
                let roomID = parseInt(window.location.hash.substr(1));
                startSubscriber(roomID)
            } else {
                await VideoRoom.attachDefault(janus)
            
                checkLastCreateRoom();
    
                VideoRoom.list( (list) => {
                    roomList = list;
                    
                    list.forEach( (room) => {
                        $('#room-list').append(`
                            <li class="li-room list-group-item list-group-item-action"
                                room-id="${room.room}">${room.description}</li>
                        `)
                    })
    
                    bindEventHandler();
    
                })
            }
        }
    });
});

function createJanusInstance() {
    return new Promise((resolve, reject) => {
        const ret = new Janus({
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
                resolve(ret);
                // attach();
            },
            error: function (error) {
                alert(error);
                // window.location.reload();
            },
            destroyed: function () {
                // window.location.reload();
            },
        });
    })
}

function bindEventHandler() {
    $('#btn-create-room').click(() => {
        const description = $('#room-desc').val();
        if(description.length < 2) {
            alert("방 제목은 2자 이상 가능합니다");
            return;
        }

        // 방만들기전에 기존의 방이 있으면 삭제하고 진행       
        const roomInfo = VideoRoom.restoreRoomInfo();
        if(roomInfo) {
            const { id, secret } = roomInfo;
            VideoRoom.destroy(id, secret, ()=>{
                VideoRoom.create({description, callback: (roomID) => {
                    startPublisher(roomID);
                }})
            })
        } else {
            VideoRoom.create({description, callback: (roomID) => {
                startPublisher(roomID);
            }})
        }
    });

    $(".li-room").click((e) => {
        const roomID = parseInt($(e.currentTarget).attr('room-id'));
        location.href = `#${roomID}`
        startSubscriber(roomID)
    });

    window.addEventListener('beforeunload', function(event) {
        // VideoRoom.clearRoomInfo();
    });
}

// localStorage에 방정보(key=createroom)가 남아있는지 체크
function checkLastCreateRoom() {
    const roomInfo = VideoRoom.restoreRoomInfo();
    if(roomInfo) {
        const { id, secret } = roomInfo;
        UI_showReconnectButton(id);
    }
}


// subscriber
function startSubscriber(roomID) {
    initUI_subscriber();
    VideoRoom.attachSubscriber({
        roomID,
        onremotestream: subscriber_handle_remotestream
    })
}

function initUI_subscriber() {
    $('#lobby').hide();

    $('#subscriber').show();
    $('#substatus').text("Connecting...");

    $('#substatus').text("Joining stream...");
}


// publisher
function startPublisher(roomID) {
    console.log("start pub")
    initUI_Publisher(roomID);

    VideoRoom.attachPublisher({
        roomID,
        success: () => {
            VideoRoom.storeRoomInfo();
            tID_roomRefresh = setInterval(VideoRoom.storeRoomInfo, 15*1000) // 15sec
        },
        onmessage: {
            joined: UI_showPlayer,
            slowlink: UI_slowLink
        },
        onlocalstream: initPoseNet
    });
}

async function initUI_Publisher(roomID) {
    $('#publisher').show();
    
    let url = window.location.origin + window.location.pathname + '#' + roomID;
    $('#loading').hide();
    $('#streamurl').text(url);
    $('#streamurl').attr('href', url);
    $('#show-streamurl').show();


    await StreamMixer.init({elementID: 'myvideo', width: 640, height: 360});

    $('#lobby').hide();
    $('#poststart').show();

    $('#video-res').val(2);
    $('#video-res').change(function () {
        const val = parseInt($(this).val());
        switch(val) {
            case 1:
                StreamMixer.setResolution({width: 320, height: 240});
                posenetState.inputResolution = 250;
                break;
            case 2:
                StreamMixer.setResolution({width: 640, height: 360});
                posenetState.inputResolution = 500;
                break;
            case 3:
                StreamMixer.setResolution({width: 1280, height: 720});
                posenetState.inputResolution = 700;
                break;
        }
        // sfutest.send({ message: { request: "configure", bitrate: parseInt($(this).val()) * 1000 } });
    });

    $('#bitrate').val(0);
    $('#bitrate').change(function () {
        VideoRoom.changeBitrate( parseInt($(this).val()) * 1000 )
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

function UI_showReconnectButton(roomID) {
    console.log(roomID)
    $('#lobby .row:first-of-type').after(`
        <div class="row py-1 justify-content-center">
            <div class="form-group px-2">
                <small>이전에 진행하던 방송이 있습니다. 재연결 하시겠습니까?</small>
            </div>
            <div class="form-group">
                <button class="btn-sm btn-outline-secondary" id="btn-reconnect">재접속</button>
            </div>
        </div>
    `)

    $('#btn-reconnect').click( () => {
        startPublisher(roomID);
    });
}


function UI_showPlayer(msg) {
    console.log('show player')
    $('#player').show();
}

function UI_slowLink(msg) {
    // TODO: this
    $('#slowlink').css('opacity', '1.0');
    $('#slowlink').animate({
        opacity: 0,
    }, 2000);
    if (++slowlinks >= 3) {
        $('#slowlink-explain').show();
    }
}

async function publisher_handle_localstream(stream) {
    console.log(stream);
    // Janus.attachMediaStream($('#myvideo').get(0), stream);
    // document.getElementById('myvideo').srcObject = stream;
    console.log("ATTACH MEDIA STREAM");
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



function subscriber_handle_remotestream(stream) {
    console.log("subscribe", stream)
    $('#substatus').text('');
    Janus.attachMediaStream($('#remotestream').get(0), stream);
}
