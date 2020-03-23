
var flipHorizontal = false;
var flagPoseNetInit = false;
var flagPoseNet = false;
var posenet_videoElement = null;
var posenet_canvasElement = null;
var posenet_canvasCtx = null;
var net = null;

const DEFAULT_STATE_METHOD = {
    values: ['single-person', 'multi-person'],
    default: 'single-person'
}

const DEFAULT_STATE_MOBILE_NET = {
    inputResolution: {
        values: [250, 500, 700],
        default: 500,
    },
    outputStride: {
        values: [8, 16],
        default: 16
    },
    multiplier: {
        values: [1, 0.75, 0.5],
        default: 1
    },
    quantBytes: {
        values: [1, 2, 4],
        default: 2
    }
}

const DEFAULT_STATE_RES_NET_50 = {
    inputResolution: {
        values: [250, 500, 700],
        default: 250,
    },
    outputStride: {
        values: [16, 32],
        default: 32
    },
    multiplier: {
        values: [1],
        default: 1
    },
    quantBytes: {
        values: [1, 2, 4],
        default: 2
    }
}

const DEFAULT_STATE_SINGLE_POSE = {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5
}

const DEFAULT_STATE_MULTI_POSE = {
    maxPoseDetections: 5,
    minPoseConfidence: 0.15,
    minPartConfidence: 0.1,
    nmsRadius: 30
}

const DEFAULT_OPTIONS = {
    faceOnly: true
}

var posenetState = {
    architecture: 'MobileNetV1',
    inputResolution: DEFAULT_STATE_MOBILE_NET.inputResolution.default,
    outputStride: DEFAULT_STATE_MOBILE_NET.outputStride.default,
    multiplier: DEFAULT_STATE_MOBILE_NET.multiplier.default,
    quantBytes: DEFAULT_STATE_MOBILE_NET.quantBytes.default,
    decodingMethod: DEFAULT_STATE_METHOD.default,
    minPoseConfidence: DEFAULT_STATE_SINGLE_POSE.minPoseConfidence,
    minPartConfidence: DEFAULT_STATE_SINGLE_POSE.minPartConfidence,
    maxPoseDetections: DEFAULT_STATE_MULTI_POSE.maxPoseDetections,
    nmsRadius: DEFAULT_STATE_MULTI_POSE.nmsRadius,
    faceOnly: DEFAULT_OPTIONS.faceOnly
}

// const POINT_COLOR = 'aqua';
// const POINT_RADIUS =  5;
function initPoseNet() {
    // document.body.appendChild(
    //     posenet_videoElement
    // )  
    posenet_canvasElement = document.getElementById('myvideo');
    posenet_canvasCtx = posenet_canvasElement.getContext("2d");
    bindEvents();
    flagPoseNetInit = true;
}

function initUI_Input(architecture) {
    const defaultState = architecture === "MobileNetV1" ? 
        DEFAULT_STATE_MOBILE_NET : DEFAULT_STATE_RES_NET_50

    setList(
        $('#fd-input-res'),
        defaultState.inputResolution );
    setList(
        $('#fd-output-stride'),
        defaultState.outputStride );
    setList(
        $('#fd-multiplier'),
        defaultState.multiplier );
    setList(
        $('#fd-quant-bytes'),
        defaultState.quantBytes );

    posenetState.inputResolution = defaultState.inputResolution.default;
    posenetState.outputStride = defaultState.outputStride.default;
    posenetState.multiplier = defaultState.multiplier.default;
    posenetState.quantBytes = defaultState.quantBytes.default;

    function setList($el, defaultValue) {
        $el.empty();
        defaultValue.values.forEach( value => {
            $el.append(
                `<option value="${value}"
                    ${value === defaultValue.default ? " selected" : ""}>
                    ${value}
                </option>`
            )
        })
    }
}

function initUI_Detection(method) {
    let defaultState = "single-person";
    
    if(method === "single-person") {
        defaultState = DEFAULT_STATE_SINGLE_POSE;
        $('#fd-max-pose-detect').attr('disabled', true);
        $('#fd-nms-radius').attr('disabled', true);

    } else {
        defaultState = DEFAULT_STATE_MULTI_POSE;
        $('#fd-max-pose-detect').attr('disabled', false);
        $('#fd-nms-radius').attr('disabled', false);
    }

    setRange($('#fd-min-pose-conf'), defaultState.minPoseConfidence)
    setRange($('#fd-min-part-conf'), defaultState.minPartConfidence);

    posenetState.minPoseConfidence = defaultState.minPoseConfidence;
    posenetState.minPartConfidence = defaultState.minPartConfidence;

    // setRange($())
    function setRange($el, defaultValue) {
        $el.val(defaultValue);
        $el.change();
    }
}

function startPoseNet() {
    setTimeout( async () => {
        if(net) net.dispose();
        net = await posenet.load(
            {
                architecture: posenetState.architecture,
                outputStride: posenetState.outputStride,
                inputResolution: posenetState.inputResolution,
                multiplier: posenetState.multiplier,
                quantBytes: posenetState.quantBytes
            }
        )
        flagPoseNet = true;
        loadPoseNet();
    }, 500)
}

function stopPoseNet() {
    flagPoseNet = false;
}

async function loadPoseNet() {
    let poses = [];
    if(!flagPoseNet) {
        posenet_canvasCtx.clearRect(0,0,posenet_canvasCtx.width, posenet_canvasCtx.height)
        StreamMixer.clearPoints();
        return
    }

    let pose = null;
    if(posenetState.method === "single-person") {
        pose = await net.estimatePoses(
            posenet_canvasElement,
            {
                flipHorizontal: false,
                decodingMethod: 'single-person'
            }
        );
    } else {
        pose = await net.estimatePoses(
            posenet_canvasElement,
            {
                flipHorizontal: false,
                decodingMethod: 'multi-person',
                maxDetections: posenetState.maxPoseDetections,
                scoreThreshold: posenetState.minPartConfidence,
                nmsRadius: posenetState.nmsRadius
            }
        );
    }


    poses = poses.concat(pose);
    const positions = [];
    poses.forEach(({score, keypoints}) => {
        if(score >= posenetState.minPoseConfidence) {
            keypoints.forEach( keypoint => {
                if(keypoint.score >= posenetState.minPartConfidence){
                    if(posenetState.faceOnly) {
                        if(keypoint.part === "nose" ||
                            keypoint.part === "leftEye" ||
                            keypoint.part === "rightEye" ||
                            keypoint.part === "leftEar" ||
                            keypoint.part === "rightEar") {
                            positions.push(keypoint.position);
                        }
                    } else {
                        positions.push(keypoint.position);
                    }
                }
            })
        }
    })
    StreamMixer.drawPoints(positions);
    
    // console.log(positions)

    window.requestAnimationFrame(loadPoseNet)
}

function restartPoseNet() {
    stopPoseNet();
    startPoseNet();
}

function bindEvents() {
    $('#fd-method').change( function(e) {
        const method = $(this).val();

        initUI_Detection(method);

        posenetState.decodingMethod = method
    });

    $('#fd-architecture').change( function(e) {
        const val = $(this).val();
        stopPoseNet();
        initUI_Input(val);

        posenetState.architecture = val;
        console.log(posenetState)
        startPoseNet();
    });

    $('#fd-input-res').change( function(e) {
        posenetState.inputResolution = parseInt($(this).val());
        restartPoseNet();
    });

    $('#fd-output-stride').change( function(e) {
        posenetState.outputStride = parseInt($(this).val());
        restartPoseNet();
    });

    $('#fd-multiplier').change( function(e) {
        posenetState.multiplier = parseFloat($(this).val());
        restartPoseNet();
    });

    $('#fd-quant-bytes').change( function(e) {
        posenetState.quantBytes = parseInt($(this).val());
        restartPoseNet();
    });


    // change label
    $(`#fd-max-pose-detect, #fd-min-pose-conf, #fd-min-part-conf, #fd-nms-radius`)
    .on('input change', function(e) {
        const $this = $(this);
        const val = $this.val();
        const $label = $this.parent().parent().find('.value');
        console.log($label)
        $label.text(val)
    });

    $('#fd-max-pose-detect').change( function(e) {
        const $this = $(this);
        const val = $this.val();
        posenetState.maxPoseDectections = parseInt(val);
    });

    $('#fd-min-pose-conf').change( function(e) {
        const $this = $(this);
        const val = $this.val();
        posenetState.minPoseConfidence = parseFloat(val);
    });

    $('#fd-min-part-conf').change( function(e) {
        const $this = $(this);
        const val = $this.val();
        posenetState.minPartConfidence = parseFloat(val);
    });

    $('#fd-nms-radius').change( function(e) {
        const $this = $(this);
        const val = $this.val();
        posenetState.nmsRadius = parseInt(val);
    });

    $('#fd-opt-face').change( function(e) {
        const $this = $(this);
        const val = $this.is(":checked");
        console.log(val)
        posenetState.faceOnly = val;
    })
}