// this is based on the "videoroomtest" Janus demo
let janus = null;
let opaqueID = Janus.randomString(12);

let sfutest = null;
let remoteFeed = null;
let roomList = null;
let myroom = null;
let server = null;
let slowlinks = 0;
let roomID = null;
let tID_roomRefresh = null;
let charIndex = 0;
let displayName = "";
let addVideoItem = [];

let playingVideoID = null;

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

            const attachRet = await VideoRoom.attachPublisher({
                opaqueID,
                onmessage: {
                    leave: UI_removeVideoItem,
                    slowlink: UI_showSlowLink()
                },
                onlocalstream: (stream) => {
                    console.log("onlocalstream")
                    UI_playLocalStream(stream);
                    UI_addVideoItem_ME(stream);
                    UI_autoSelectVideo();
                },
                onremotestream: (id, display, stream) => {
                    UI_addVideoItem(id, display, stream);
                }
            });

            console.log("attached pub")
            console.log(attachRet)

            UI_showNamePanel();
            bindEventMuteButton();
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

function UI_showNamePanel() {
    $('#input-name-container').show();
    
    UserInfo.restoreNameFromLocalStorage();

    $('#btn-confirm-name').click( ()=>{
        if(UserInfo.storeNameToLocalStorage()) {
            $('#input-name-container').hide();
            UI_showMainPanel();
        }
    })
}

async function UI_showMainPanel() {
    if (window.location.hash) {
        // join room
        roomID = parseInt(window.location.hash.substr(1));
        connect(roomID);
        bindSubscriberEventHandler(roomID);

        const participants = await VideoRoom.listParticipants(roomID);
        console.log(participants)
        for(participant of participants) {
            console.log("loop partcipants")
            VideoRoom.newRemoteFeed({
                id: participant.id,
                onremotestream: (id, display, stream) => {
                    UI_addVideoItem(id, display, stream);
                    UI_autoSelectVideo();
                }
            })
        }
    } else {
        $('#lobby').show();      
        // 마지막으로 만들었던 방이 있는지 체크(의도치않게 새로고침이나 연결끊김시 시간내에 재접속 가능)
        checkLastCreateRoom();
        $('#room-desc').val(`${UserInfo.getDisplayName()}의 방송`)
        VideoRoom.list( (list) => {
            roomList = list;
            list.forEach( (room) => {
                $('#room-list').append(`
                    <li class="li-room list-group-item list-group-item-action"
                        room-id="${room.room}">${room.description}</li>
                `)
            })
            bindLobbyEventHandler();
        })
    }
}

function bindLobbyEventHandler() {
    $('#room-desc').keypress( (e) => {
        var theCode = e.keyCode ? e.keyCode : e.which ? e.which : e.charCode;
        if(theCode == 13) {
            $('#btn-create-room').trigger('click');
            return false;
        } else {
            return true;
        }
    })
    $('#btn-create-room').click(async () => {
        const description = $('#room-desc').val();

        // validation check
        // description(=room name)
        if(description === "") {
            alert("방 제목을 입력해 주세요");
            return false;
        }
        if(description.length < 2) {
            alert("방 제목은 2자 이상 가능합니다");
            return false;
        }

        // 방만들기전에 기존의 방이 있으면 삭제하고 진행       
        const roomInfo = VideoRoom.restoreRoomInfo();
        if(roomInfo) {
            const { id, secret } = roomInfo;
            await VideoRoom.destroy(id, secret)
        }

        roomID = await VideoRoom.create(description);

        await TextRoom.attach({roomID, opaqueID});
        await TextRoom.create(roomID);

        connect(roomID);

        await VideoRoom.joinPublisher(roomID, UserInfo.getDisplayName());
    });

    $(".li-room").click((e) => {
        roomID = parseInt($(e.currentTarget).attr('room-id'));
        location.href = `#${roomID}`
        UI_showMainPanel()
    });

    window.addEventListener('beforeunload', function(event) {
        // VideoRoom.clearRoomInfo();
        VideoRoom.leavePublisher();
    });
}

function bindChatEventHandler() {
    $("#chat-input").keypress((e) => {
        var theCode = e.keyCode ? e.keyCode : e.which ? e.which : e.charCode;
        if(theCode == 13) {
            const text = $('#chat-input').val();
            TextRoom.sendData(text);
            $('#chat-input').val('');
            return false;
        } else {
            return true;
        }
    })

    $('#btn-chat-send').click( (e) => {
        e.preventDefault();
        const text = $('#chat-input').val();
        TextRoom.sendData(text);
        $('#chat-input').val('');
    })
}

// localStorage에 방정보(key=createroom)가 남아있는지 체크
function checkLastCreateRoom() {
    const roomInfo = VideoRoom.restoreRoomInfo();
    if(roomInfo) {
        const { id, secret } = roomInfo;
        UI_showReconnectButton(id);
    }
}

function UI_showReconnectButton(roomID) {
    $('#reconnect-room-container').show();

    $('#btn-reconnect').click( async () => {
        const roomInfo = VideoRoom.restoreRoomInfo();
        connect(roomInfo.id);

        await VideoRoom.joinPublisher(roomID, UserInfo.getDisplayName());

        UI_autoSelectVideo();
    });
}

function bindSubscriberEventHandler(roomID) {
    $('#btn-subscribe-call').show();
    $('#btn-subscribe-call').click( (e) => {
        e.preventDefault();
        const $item = $(e.currentTarget);
        if($item.hasClass('calling')){
            VideoRoom.unpublish();
            $('.li-stream-card.me').remove();
            UI_autoSelectVideo();
            $item.removeClass('calling');
        } else {
            VideoRoom.publish(roomID, UserInfo.getDisplayName());
            $item.addClass('calling');
        }
    });
}

function bindEventMuteButton() {
    $('#btn-subscribe-mute').click( (e) => {
        console.log('click mute')
        const video = $('#myvideo').get(0);
        const icon = $('#btn-subscribe-mute .icon');
        video.muted = !video.muted;
        if(video.muted) {
            icon.attr('src', 'img/ic-volume-off.png');
        } else {
            icon.attr('src', 'img/ic-volume-on.png');
        }
    })
}

function UI_addVideoItem(id, display, stream) {
    console.log("addvideoitem", id)
    // onremotestream이 여러번 들어오기 떄문에 element를 한번만 생성해줄 장치가 필요함
    if(!addVideoItem[id]) {
        addVideoItem[id] = true
        $('#feed-list')
        .append(`
            <li class="li-stream-card" id="vi-${id}">
                <video autoplay playsinline muted="muted" />
                <div class="name">${display}</div>
                <div class="vol-meter"></div>
                <div class="btn-mute">
                    <img class="icon" src="img/ic-volume-off.png">
                </div>
            </li>
        `)

        const $item = $(`#vi-${id}`);
        const $btnMute = $item.find('.btn-mute');

        $item.click((e) => {
            e.preventDefault();
            $('#myvideo').get(0).srcObject = cardVideo.srcObject;

            $('.li-stream-card').removeClass('active')
            $item.addClass('active');
        });


        $btnMute.click((e) => {
            e.stopPropagation();
            const video = $item.find('video').get(0);
            const icon = $item.find('.btn-mute .icon');
            video.muted = !video.muted;
            if(video.muted) {
                icon.attr('src', 'img/ic-volume-off.png');
            } else {
                icon.attr('src', 'img/ic-volume-on.png');
            }
        });

    }

    if(stream.getAudioTracks().length > 0) {
        const $item = $(`#vi-${id}`);
        const icon = $item.find('.vol-meter');
        attachVolumeMeter(icon, stream)
    }

    const $item = $(`#vi-${id}`);
    const cardVideo = $item.find('video').get(0);
    cardVideo.srcObject = stream;
    cardVideo.play();
}

function UI_addVideoItem_ME(stream) {
    console.log("addMyStream")
    $('#feed-list')
    .prepend(`
        <li class="li-stream-card me" id="vi-me">
            <video autoplay playsinline muted="muted" />
            <div class="name">me</div>
        </li>
    `)

    const $item = $('#vi-me');
    const cardVideo = $item.find('video').get(0);
    cardVideo.srcObject = stream;
    cardVideo.play();

    $item.click((e) => {
        e.preventDefault();
        $('#myvideo').get(0).srcObject = cardVideo.srcObject;

        $('.li-stream-card').removeClass('active')
        $item.addClass('active');
    })
}

function UI_removeVideoItem(id) {
    addVideoItem[id] = false;
    $(`#vi-${id}`).remove();
}

function UI_autoSelectVideo() {
    let $item = null;
    const myvideo = document.getElementById('myvideo');

    if(!playingVideoID || !document.getElementById(`vi-${playingVideoID}`)) {
        $item = $(`.li-stream-card:eq(0)`);
    } else {
        $item = $(`#vi-${playingVideoID}`)
    }
   
    console.log("ui autoselectvideo")
    console.log($item)
    $('.li-stream-card').removeClass('active');
    $item.addClass('active');

    playingVideoID = $item.attr('id');
    const srcVideo = $item.find('video').get(0);

    Janus.attachMediaStream(myvideo, srcVideo.srcObject);
}

function addRemoteStream(stream) {
    console.log("addRemoteStream")
    // $('#subscriber #stream-list').append(`
    //     <li class="li-stream-card">
    //         <video autoplay playsinline muted="muted" />
    //     </li>
    // `)

    // const myVideo = $('.li-stream-card video').get(0);
    // myVideo.srcObject = stream;
    // myVideo.play();
}

// publisher
async function connect(roomID) {
    VideoRoom.setRoomID(roomID);

    UI_initPlayer(roomID);  
    UI_showPlayer();
    
    // 내가 개설자인지 판단하여 reconnect에 대한 expire를 주기적으로 늘려줌
    VideoRoom.checkCreator(roomID);

    // textroom join
    if(!TextRoom.isAttached()) await TextRoom.attach({roomID});
    TextRoom.join({
        roomID,
        userInfo: {
            displayName : UserInfo.getDisplayName(),
            charIndex: UserInfo.getCharIndex()
        },
        success: () => { bindChatEventHandler(); }
    });
}

async function UI_initPlayer(roomID) {
    $('#lobby').hide();
    $('#main-container').show();

    $('#publisher').show();
    $('#chat-wrapper').show();
    let url = window.location.origin + window.location.pathname + '#' + roomID;
    $('#loading').hide();
    $('#streamurl').text(url);
    $('#streamurl').attr('href', url);
    $('#show-streamurl').show();
    // await StreamMixer.init({elementID: 'myvideo', width: 640, height: 360});

    $('#poststart').show();

    $('#video-res').val(2);
    $('#video-res').change(function () {
        const val = parseInt($(this).val());
        // switch(val) {
        //     case 1:
        //         StreamMixer.setResolution({width: 320, height: 240});
        //         posenetState.inputResolution = 250;
        //         break;
        //     case 2:
        //         StreamMixer.setResolution({width: 640, height: 360});
        //         posenetState.inputResolution = 500;
        //         break;
        //     case 3:
        //         StreamMixer.setResolution({width: 1280, height: 720});
        //         posenetState.inputResolution = 700;
        //         break;
        // }
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



function UI_showPlayer(msg) {
    const player = $('#publisher .player').show();
    if (window.location.hash) {
        player.find('#btn-subscribe-call').show();
        player.find('#btn-facedetect').hide();
    } else {
        player.find('#btn-subscribe-call').hide();
        player.find('#btn-facedetect').hide();
    }
}

function UI_showSlowLink(msg) {
    // TODO: this
    $('#slowlink').css('opacity', '1.0');
    $('#slowlink').animate({
        opacity: 0,
    }, 2000);
    if (++slowlinks >= 3) {
        $('#slowlink-explain').show();
    }
}

async function UI_playLocalStream(stream) {
    Janus.attachMediaStream($('#myvideo').get(0), stream);
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

// function publishOwnFeed() {
//     sfutest.createOffer({
//         media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
//         simulcast: false,
//         success: function (jsep) {
//             $('#player').show();
//             sfutest.send({
//                 message: { "request": "configure", "audio": true, "video": true },
//                 jsep: jsep,
//             });
//         },
//         error: function (error) {
//             alert("WebRTC error: " + JSON.stringify(error));
//         },
//     });
// }

function handleRemoteStream(id, stream) {
    console.log("subscribe", stream)
    $('#substatus').text('');
    $('#substatus').hide();

    var addButtons = false;
    if($('#remotevideo'+remoteFeed.rfindex).length === 0) {
        addButtons = true;
        // No remote video yet
        $('#videoremote'+remoteFeed.rfindex).append('<video class="rounded centered" id="waitingvideo' + remoteFeed.rfindex + '" width=320 height=240 />');
        $('#videoremote'+remoteFeed.rfindex).append('<video class="rounded centered relative hide" id="remotevideo' + remoteFeed.rfindex + '" width="100%" height="100%" autoplay playsinline/>');
        $('#videoremote'+remoteFeed.rfindex).append(
            '<span class="label label-primary hide" id="curres'+remoteFeed.rfindex+'" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;"></span>' +
            '<span class="label label-info hide" id="curbitrate'+remoteFeed.rfindex+'" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;"></span>');
        // Show the video, hide the spinner and show the resolution when we get a playing event
        $("#remotevideo"+remoteFeed.rfindex).bind("playing", function () {
            if(remoteFeed.spinner !== undefined && remoteFeed.spinner !== null)
                remoteFeed.spinner.stop();
            remoteFeed.spinner = null;
            $('#waitingvideo'+remoteFeed.rfindex).remove();
            if(this.videoWidth)
                $('#remotevideo'+remoteFeed.rfindex).removeClass('hide').show();
            var width = this.videoWidth;
            var height = this.videoHeight;
            $('#curres'+remoteFeed.rfindex).removeClass('hide').text(width+'x'+height).show();
            if(Janus.webRTCAdapter.browserDetails.browser === "firefox") {
                // Firefox Stable has a bug: width and height are not immediately available after a playing
                setTimeout(function() {
                    var width = $("#remotevideo"+remoteFeed.rfindex).get(0).videoWidth;
                    var height = $("#remotevideo"+remoteFeed.rfindex).get(0).videoHeight;
                    $('#curres'+remoteFeed.rfindex).removeClass('hide').text(width+'x'+height).show();
                }, 2000);
            }
        });
    }
    Janus.attachMediaStream($('#remotevideo'+remoteFeed.rfindex).get(0), stream);
    var videoTracks = stream.getVideoTracks();
    if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
        // No remote video
        $('#remotevideo'+remoteFeed.rfindex).hide();
        if($('#videoremote'+remoteFeed.rfindex + ' .no-video-container').length === 0) {
            $('#videoremote'+remoteFeed.rfindex).append(
                '<div class="no-video-container">' +
                    '<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
                    '<span class="no-video-text">No remote video available</span>' +
                '</div>');
        }
    } else {
        $('#videoremote'+remoteFeed.rfindex+ ' .no-video-container').remove();
        $('#remotevideo'+remoteFeed.rfindex).removeClass('hide').show();
    }
    if(!addButtons)
        return;
    if(Janus.webRTCAdapter.browserDetails.browser === "chrome" || Janus.webRTCAdapter.browserDetails.browser === "firefox" ||
            Janus.webRTCAdapter.browserDetails.browser === "safari") {
        $('#curbitrate'+remoteFeed.rfindex).removeClass('hide').show();
        bitrateTimer[remoteFeed.rfindex] = setInterval(function() {
            // Display updated bitrate, if supported
            var bitrate = remoteFeed.getBitrate();
            $('#curbitrate'+remoteFeed.rfindex).text(bitrate);
            // Check if the resolution changed too
            var width = $("#remotevideo"+remoteFeed.rfindex).get(0).videoWidth;
            var height = $("#remotevideo"+remoteFeed.rfindex).get(0).videoHeight;
            if(width > 0 && height > 0)
                $('#curres'+remoteFeed.rfindex).removeClass('hide').text(width+'x'+height).show();
        }, 1000);
    }
}


