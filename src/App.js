import React, { useEffect, useRef, useState } from "react";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import AssignmentIcon from "@material-ui/icons/Assignment";
import PhoneIcon from "@material-ui/icons/Phone";
import { CopyToClipboard } from "react-copy-to-clipboard";
import Peer from "simple-peer";
import io from "socket.io-client";
import "./App.css";

const socket = io.connect("http://localhost:5000");

function App() {
    const [me, setMe] = useState("");
    const [stream, setStream] = useState(null);
    const [receivingCall, setReceivingCall] = useState(false);
    const [caller, setCaller] = useState("");
    const [callerSignal, setCallerSignal] = useState(null);
    const [callAccepted, setCallAccepted] = useState(false);
    const [idToCall, setIdToCall] = useState("");
    const [callEnded, setCallEnded] = useState(false);
    const [name, setName] = useState("");
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [recording, setRecording] = useState(false);

    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef();
    const mediaRecorderRef = useRef();
    const recordedChunks = useRef([]);

    useEffect(() => {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((mediaStream) => {
                setStream(mediaStream);
                myVideo.current.srcObject = mediaStream;
            })
            .catch((error) => console.error("Error accessing media devices:", error));

        socket.on("me", (id) => setMe(id));
        socket.on("callUser", (data) => {
            setReceivingCall(true);
            setCaller(data.from);
            setName(data.name);
            setCallerSignal(data.signal);
        });
    }, []);

    const callUser = (id) => {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", (data) => {
            socket.emit("callUser", {
                userToCall: id,
                signalData: data,
                from: me,
                name,
            });
        });

        peer.on("stream", (remoteStream) => {
            userVideo.current.srcObject = remoteStream;
        });

        socket.on("callAccepted", (signal) => {
            setCallAccepted(true);
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    const answerCall = () => {
        setCallAccepted(true);

        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on("signal", (data) => {
            socket.emit("answerCall", { signal: data, to: caller });
        });

        peer.on("stream", (remoteStream) => {
            userVideo.current.srcObject = remoteStream;
        });

        peer.signal(callerSignal);
        connectionRef.current = peer;
    };

    const leaveCall = () => {
        setCallEnded(true);
        connectionRef.current && connectionRef.current.destroy();
    };

    const toggleMic = () => {
        setMicEnabled((prev) => !prev);
        stream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    };

    const toggleCamera = () => {
        setCameraEnabled((prev) => !prev);
        stream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    };

	const startRecording = async () => {
		if (!stream || !connectionRef.current) return;
	
		// Create an audio context
		const audioContext = new AudioContext();
	
		// Create MediaStreamAudioSourceNodes for both microphone and remote audio
		const micSource = audioContext.createMediaStreamSource(stream);
		const remoteStream = connectionRef.current._remoteStreams[0]; // Access remote stream from Peer
		const remoteSource = remoteStream
			? audioContext.createMediaStreamSource(remoteStream)
			: null;
	
		// Create a destination for the mixed audio
		const destination = audioContext.createMediaStreamDestination();
	
		// Connect the sources to the destination
		micSource.connect(destination);
		if (remoteSource) {
			remoteSource.connect(destination);
		}
	
		// Combine video from local stream with the mixed audio
		const mixedStream = new MediaStream([
			...stream.getVideoTracks(),
			...destination.stream.getAudioTracks(),
		]);
	
		// Set up MediaRecorder for the combined stream
		mediaRecorderRef.current = new MediaRecorder(mixedStream);
		recordedChunks.current = [];
	
		mediaRecorderRef.current.ondataavailable = (event) => {
			if (event.data.size > 0) recordedChunks.current.push(event.data);
		};
	
		mediaRecorderRef.current.onstop = () => {
			const blob = new Blob(recordedChunks.current, { type: "video/webm" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.style.display = "none";
			a.href = url;
			a.download = "recording.webm";
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
		};
	
		mediaRecorderRef.current.start();
		setRecording(true);
	};
	

    const stopRecording = () => {
        mediaRecorderRef.current && mediaRecorderRef.current.stop();
        setRecording(false);
    };

    return (
        <div>
            <h1 style={{ textAlign: "center", color: "#fff" }}>Video Call App</h1>
            <div className="container">
                <div className="video-container">
                    <div className="video">
                        {stream && <video playsInline muted ref={myVideo} autoPlay style={{ width: "300px" }} />}
                    </div>
                    <div className="video">
                        {callAccepted && !callEnded ? (
                            <video playsInline ref={userVideo} autoPlay style={{ width: "300px" }} />
                        ) : null}
                    </div>
                </div>
                <div className="myId">
                    <TextField
                        label="Name"
                        variant="filled"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ marginBottom: "20px" }}
                    />
                    <CopyToClipboard text={me} style={{ marginBottom: "2rem" }}>
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<AssignmentIcon fontSize="large" />}
                        >
                            Copy ID
                        </Button>
                    </CopyToClipboard>

                    <TextField
                        label="ID to call"
                        variant="filled"
                        value={idToCall}
                        onChange={(e) => setIdToCall(e.target.value)}
                    />
                    <div className="call-button">
                        {callAccepted && !callEnded ? (
                            <Button variant="contained" color="secondary" onClick={leaveCall}>
                                End Call
                            </Button>
                        ) : (
                            <IconButton color="primary" aria-label="call" onClick={() => callUser(idToCall)}>
                                <PhoneIcon fontSize="large" />
                            </IconButton>
                        )}
                    </div>
                </div>
                {receivingCall && !callAccepted && (
                    <div className="caller">
                        <h1>{name} is calling...</h1>
                        <Button variant="contained" color="primary" onClick={answerCall}>
                            Answer
                        </Button>
                    </div>
                )}
                <div className="controls">
                    <Button variant="contained" color="primary" onClick={toggleMic}>
                        {micEnabled ? "Mute Mic" : "Unmute Mic"}
                    </Button>
                    <Button variant="contained" color="primary" onClick={toggleCamera}>
                        {cameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
                    </Button>
                    {recording ? (
                        <Button variant="contained" color="secondary" onClick={stopRecording}>
                            Stop Recording
                        </Button>
                    ) : (
                        <Button variant="contained" color="primary" onClick={startRecording}>
                            Start Recording
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
