## Project Jukebox: Technical Specification & Implementation Blueprint
Status: Final - Production Ready
Version: 2.5
Target Environment: Ubuntu 24 LTS / Proxmox 9
Infrastructure Context: 10Gb Internal SFP+ / 2.5Gb ONT Fibre

======================

### 1. Room Discovery Schema (stream_list.php)

The system must maintain a local registry by parsing the manifest at the following URL:
https://batc.org.uk/live-api/stream_list.php

Data Fields for Registry:
+ active: Integer - Presence indicates the room is live. Treat as a boolean true.
+ stream_description: String - Metadata (may contain HTML or escaped newlines).
+ stream_listed: String - "1" = Public; "0" = Hidden.
+ stream_output_url: String - Unique ID used for the socket room parameter.
+ stream_title: String - Human-readable name of the station.
+ stream_type_event: String - "1" if an Event.
+ stream_type_member: String - "1" if a Member.
+ stream_type_repeater: String - "1" if a Repeater.
+ streaming_type_flash: String - "1" if legacy Flash is enabled.
+ streaming_type_html5: String - "1" if modern HLS/DASH is enabled.

### 1.1 Discovery Logic (The Last-In Rule)
Process arrays in the following order: members, then repeaters, then events. The final instance of a stream_output_url encountered is the authoritative entry for deduplication.

======================

### 2. Connection & Protocol Architecture

### 2.1 Endpoint Specification
+ Protocol: Socket.io v2.1.0 (Engine.io v3).
+ URI: wss://batc.org.uk/live-chat/socket.io/?room=[stream_output_url]&EIO=3&transport=websocket
+ Encoding: * Full UTF-8 support * for nicks and messages (e.g., "🤖ODZBot🤖" is a valid nick).

### 2.2 Date/Timestamp Breakdown (ISO 8601 UTC)
Sample: 2026-04-09T10:10:27.798Z
+ Year: Bytes 0-3 (e.g., 2026)
+ Month: Bytes 5-6 (e.g., 04)
+ Day: Bytes 8-9 (e.g., 09)
+ Time: Bytes 11-18 (e.g., 10:10:27)
+ Millis: Bytes 20-22 (e.g., 798)
+ Suffix: Byte 23 (Z - UTC indicator)

======================

### 3. Data Packet Dictionary

All packets are prefixed with the Engine.io/Socket.io header 42.

### 3.1 Packet Concatenation & Stream Parsing
* Crucial *: The server frequently sends packets concatenated within a single WebSocket frame.
+ Sample: 42["history",{"nicks":[...],"history":[...]}]42["viewers",{"num":1}]
+ Implementation: The parser must iterate through the buffer to identify every "42[" prefix to split and process individual JSON payloads.

### 3.2 Inbound Samples (Server to Bot)

### 3.2.1 history (Real Data Sample)
```history_sample.json
42["history", {
"nicks": ["Greg M0ODZ", "User1"],
"history": [
{
"time": "2026-04-09T10:10:27.798Z",
"name": "🤖ODZBot🤖",
"message": "💤 Searching the digital crates... found 20210711 - Qatar Amateur Radio Operator A71AM, Saif, Is Interviewed By Jim Heath W6LG Ham Radio Elmer!"
},
{
"time": "2026-04-09T11:00:26.203Z",
"name": "🤖ODZBot🤖",
"message": "========================== "
}
]
}]
```

### 3.2.2 Live Updates
+ nicks: 42["nicks", ["Greg M0ODZ", "User1", "🤖ODZBot🤖"]]
+ message: 42["message", {"time": "2026-04-17T22:45:01.123Z", "name": "User1", "message": "Hello!"}]
+ viewers: 42["viewers", {"num": 12}]

### 3.3 Outbound (Bot to Server)
+ Identity: 42["setnick", {"nick": "🤖ODZBot🤖"}]
+ Chat: 42["message", {"message": "Greetings from the bot! 🤖"}] (Constraint: Only send the message key).

======================

### 4. Transmission & Anti-Spam Logic

+ 1. Duplicate Suppression: Identical strings sent sequentially are ignored. Vary "Welcome" phrases.
+ 2. Message Throttling: Minimum 200ms gap required between any two outgoing packets.
+ 3. Buffer Requirement: Outbound messages must be queued and released sequentially with a 200ms timer.

### 5. Room State & Reconciliation Logic

+ 1. Arrivals: current_nicks minus last_nicks. Trigger Welcome (only if is_initialised).
+ 2. Renames: 1 Arrival and 1 Departure in one cycle. Trigger Congratulate.
+ 3. Update: Sync last_nicks with current data after each comparison.

### 6. Implementation Standards

+ Scale: Support 350+ concurrent WebSockets; increase ulimit for file descriptors.
+ Encoding: Ensure the application handles full UTF-8 for all I/O.

======================

End of Specification