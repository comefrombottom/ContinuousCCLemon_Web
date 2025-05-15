mergeInto(LibraryManager.library, {
    $siv3dStringToNewUTF32: function (str) {
        var size = lengthBytesUTF32(str) + 4;
        var ret = _malloc(size);
        if (ret) stringToUTF32(str, ret, size);
        return ret;
    },
    $siv3dStringToNewUTF32__deps: ["$lengthBytesUTF32", "$stringToUTF32"],

    $siv3dPhotonClient: null,

    $siv3dPhotonCallbackCode: {
        ConnectionErrorReturn: 1,
        ConnectReturn: 11,
        DisconnectReturn: 12,
        LeaveRoomReturn: 21,
        JoinRandomRoomReturn: 22,
        JoinRandomOrCreateRoomReturn: 23,
        JoinRoomReturn: 24,
        JoinOrCreateRoomReturn: 25,
        CreateRoomReturn: 26,
        ClientStateChange: 31,
        AppStateChange: 32,
        ActorJoin: 33,
        ActorLeave: 34,
        CustomEvent: 35,
        OnRoomListUpdate: 41,
        OnRoomPropertiesChange: 42,
    },

    $siv3dPhotonClientState: {
		Disconnected: 0,
		ConnectingToLobby: 1,
		InLobby: 2,
		JoiningRoom: 3,
		InRoom: 4,
		LeavingRoom: 5,
		Disconnecting: 6,
    },

    siv3dPhotonInitClient: function (appID_ptr, appVersion_ptr, verbose, protocol) {
        const appID = UTF32ToString(appID_ptr);
        const appVersion = UTF32ToString(appVersion_ptr);
        
        if (siv3dPhotonClient !== null) {
            siv3dPhotonClient.disconnect();
        }

        siv3dPhotonClient = new Photon.LoadBalancing.LoadBalancingClient(protocol, appID, appVersion);

        siv3dPhotonClient.waitingCallback = null;
        siv3dPhotonClient.callbackCacheList = [];

        siv3dPhotonClient.setLogLevel(verbose ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);

        /*
        const initNameServerPeer_ = Photon.LoadBalancing.LoadBalancingClient.prototype.initNameServerPeer;
        Photon.LoadBalancing.LoadBalancingClient.prototype.initNameServerPeer = function (peer) {
            initNameServerPeer_.call(this, peer);
        };
        */

        const initMasterPeer_ = Photon.LoadBalancing.LoadBalancingClient.prototype.initMasterPeer;
        Photon.LoadBalancing.LoadBalancingClient.prototype.initMasterPeer = function (peer) {
            initMasterPeer_.call(this, peer);

            peer.addPeerStatusListener(Photon.PhotonPeer.StatusCodes.connect, function () {
                siv3dPhotonClient.masterPeer.ping(true);
            });
    
            peer.addResponseListener(Photon.LoadBalancing.Constants.OperationCode.JoinRandomGame, function (data) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.JoinRandomRoomReturn, errCode: data.errCode, errMsg: data.errMsg ? data.errMsg : "", actorNr: siv3dPhotonClient.myActor().actorNr });
            });
            peer.addResponseListener(Photon.LoadBalancing.Constants.OperationCode.JoinGame, function (data) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.JoinRoomReturn, errCode: data.errCode, errMsg: data.errMsg ? data.errMsg : "", actorNr: siv3dPhotonClient.myActor().actorNr });
            });
            peer.addResponseListener(Photon.LoadBalancing.Constants.OperationCode.CreateGame, function (data) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.CreateRoomReturn, errCode: data.errCode, errMsg: data.errMsg ? data.errMsg : "", actorNr: siv3dPhotonClient.myActor().actorNr });
            });
        };

        const initGamePeer_ = Photon.LoadBalancing.LoadBalancingClient.prototype.initGamePeer;
        Photon.LoadBalancing.LoadBalancingClient.prototype.initGamePeer = function (peer, masterOpCode) {
            initGamePeer_.call(this, peer, masterOpCode);

            peer.addResponseListener(Photon.LoadBalancing.Constants.OperationCode.Leave, function (data) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.LeaveRoomReturn, errCode: data.errCode, errMsg: data.errMsg ? data.errMsg : "" });
            });
        };

        siv3dPhotonClient.onStateChange = function (state) {
            let clientState;
            const State = Photon.LoadBalancing.LoadBalancingClient.State;
            switch (state) {
                case State.Error:
                case State.Uninitialized:
                case State.Disconnected:
                    clientState = siv3dPhotonClientState.Disconnected;
                    break;
                case State.ConnectingToNameServer:
                case State.ConnectedToNameServer:
                case State.ConnectingToMasterserver:
                case State.ConnectedToMaster:
                    clientState = siv3dPhotonClientState.ConnectingToLobby;
                    break;
                case State.JoinedLobby:
                    siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ConnectReturn, errCode: 0, errMsg: "" });
                    clientState = siv3dPhotonClientState.InLobby;
                    break;
                case State.ConnectingToGameserver:
                case State.ConnectedToGameserver:
                    clientState = siv3dPhotonClientState.JoiningRoom;
                    break;
                case State.Joined:
                    clientState = siv3dPhotonClientState.InRoom;
                    break;
            }
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ClientStateChange, state: clientState });
        };
        
        siv3dPhotonClient.onAppStats = function (errorCode, errorMsg, stats) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.AppStateChange, stats: stats });
        };
        
        siv3dPhotonClient.onActorJoin = function (actor) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ActorJoin, actorNr: actor.actorNr, myself: siv3dPhotonClient.myActor().actorNr == actor.actorNr });
        };
        
        siv3dPhotonClient.onActorLeave = function (actor, cleanup) {
            if (!cleanup) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ActorLeave, actorNr: actor.actorNr, isSuspended: false });
            }
        };
        
        siv3dPhotonClient.onActorSuspend = function (actor) {
            if (!cleanup) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ActorLeave, actorNr: actor.actorNr, isSuspended: true });
            }
        };
        
        siv3dPhotonClient.onEvent = function (eventCode, content, actorNr) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.CustomEvent, eventCode: eventCode, message: content, actorNr: actorNr });
        };

        siv3dPhotonClient.onRoomList = function (rooms) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.OnRoomListUpdate });
        };

        siv3dPhotonClient.onRoomListUpdate = function (rooms, roomsUpdated, roomsAdded, roomsRemoved) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.OnRoomListUpdate });
        };

        Photon.LoadBalancing.RoomInfo.prototype.onPropertiesChange = function (changedCustomProps, byClient) {
            siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.OnRoomPropertiesChange, change: changedCustomProps });
        };

        siv3dPhotonClient.onError = function (errorCode, errorMsg) {
            if (errorCode) {
                siv3dPhotonClient.callbackCacheList.push({ type: siv3dPhotonCallbackCode.ConnectionErrorReturn, errCode: errorCode, errMsg: errorMsg });
            }
        };

        if (!siv3dPhotonClient.pingInterval) {
            siv3dPhotonSetPingInterval(2000);
        }
    },
    siv3dPhotonInitClient__sig: "viiii",
    siv3dPhotonInitClient__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode", "$siv3dPhotonClientState", "$siv3dPhotonSetPingInterval"],

    siv3dPhotonConnect: function (userId_ptr, region_ptr) {
        siv3dPhotonClient.disconnect();

        siv3dPhotonClient.setUserId(UTF32ToString(userId_ptr));
        siv3dPhotonClient.region = UTF32ToString(region_ptr);

        const options = {
            region: siv3dPhotonClient.region,
            lobbyStats: true,
        };

        if (!siv3dPhotonClient.connectToNameServer(options)) {
            return false;
        }

        siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.ConnectReturn;

        return true;
    },
    siv3dPhotonConnect__sig: "iii",
    siv3dPhotonConnect__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode"],

    siv3dPhotonDisconnect: function () {
        siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.DisconnectReturn;
        siv3dPhotonClient.disconnect();
    },
    siv3dPhotonDisconnect__sig: "v",
    siv3dPhotonDisconnect__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode"],

    siv3dPhotonService: function () {
        if (siv3dPhotonClient.isJoinedToRoom())
        {
            const host = siv3dPhotonClient.myRoomMasterActorNr();
            if (siv3dPhotonClient.lastMasterClient != host)
            {
                _siv3dPhotonOnHostChangeCallback(host, siv3dPhotonClient.lastMasterClient);
                siv3dPhotonClient.lastMasterClient = host;
            }
        }

        let callbackCacheList = siv3dPhotonClient.callbackCacheList;
        siv3dPhotonClient.callbackCacheList = [];
        for (const callback of callbackCacheList) {
            console.log("[Multiplayer_Photon] [js] siv3dPhotonService");
            console.log("[Multiplayer_Photon] [js] callback: ", callback.type);
            console.log("[Multiplayer_Photon] [js] waiting: ", siv3dPhotonClient.waitingCallback);
            switch (callback.type) {
                case siv3dPhotonCallbackCode.ConnectionErrorReturn:
                    siv3dPhotonClient.waitingCallback = null;
                    _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), -1);
                    break;

                case siv3dPhotonCallbackCode.DisconnectReturn:
                    if (!siv3dPhotonClient.waitingCallback || siv3dPhotonClient.waitingCallback == callback.type) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, 0, siv3dStringToNewUTF32(callback.errMsg), -1);
                    }
                    break;

                case siv3dPhotonCallbackCode.ConnectReturn:
                case siv3dPhotonCallbackCode.LeaveRoomReturn:
                    if (siv3dPhotonClient.waitingCallback == callback.type) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), -1);
                    }
                    break;

                case siv3dPhotonCallbackCode.JoinRandomRoomReturn:
                    if (siv3dPhotonClient.waitingCallback == siv3dPhotonCallbackCode.JoinRandomRoomReturn) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), callback.actorNr);
                    } else if (siv3dPhotonClient.waitingCallback == siv3dPhotonCallbackCode.JoinRandomOrCreateRoomReturn) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), callback.actorNr);
                    }
                    break;

                case siv3dPhotonCallbackCode.JoinRoomReturn:
                    if (siv3dPhotonClient.waitingCallback == siv3dPhotonCallbackCode.JoinRoomReturn) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), callback.actorNr);
                    } else if (siv3dPhotonClient.waitingCallback == siv3dPhotonCallbackCode.JoinOrCreateRoomReturn) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), callback.actorNr);
                    }
                    break;

                case siv3dPhotonCallbackCode.CreateRoomReturn:
                    if (siv3dPhotonClient.waitingCallback == callback.type) {
                        siv3dPhotonClient.waitingCallback = null;
                        _siv3dPhotonGeneralCallback(callback.type, callback.errCode, siv3dStringToNewUTF32(callback.errMsg), callback.actorNr);
                    }
                    break;

                case siv3dPhotonCallbackCode.ClientStateChange:
                    _siv3dPhotonClientStateChangeCallback(callback.state);
                    break;
                case siv3dPhotonCallbackCode.AppStateChange:
                    _siv3dPhotonAppStateChangeCallback(callback.stats.gameCount, callback.stats.peerCount, callback.stats.masterPeerCount);
                    break;
                case siv3dPhotonCallbackCode.ActorJoin:
                    siv3dPhotonClient.lastMasterClient = siv3dPhotonClient.myRoomMasterActorNr();
                    _siv3dPhotonActorJoinCallback(callback.actorNr, callback.myself);
                    break;
                case siv3dPhotonCallbackCode.ActorLeave:
                    _siv3dPhotonActorLeaveCallback(callback.actorNr, callback.isSuspended);
                    break;
                case siv3dPhotonCallbackCode.CustomEvent:
                    _siv3dPhotonCustomEventCallback(callback.actorNr, callback.eventCode, stringToNewUTF8(callback.message));
                    break;
                case siv3dPhotonCallbackCode.OnRoomListUpdate:
                    _siv3dPhotonOnRoomListUpdateCallback();
                    break;
                case siv3dPhotonCallbackCode.OnRoomPropertiesChange:
                    siv3dPhotonClient.storedRoomProperties = Object.entries(callback.change);
                    _siv3dPhotonOnRoomPropertiesChangeCallback();
                    break;
                case siv3dPhotonCallbackCode.OnPlayerPropertiesChange:
                    _siv3dPhotonOnPlayerPropertiesChangeCallback(callback.actorNr);
                    break;
            }
        }
    },
    siv3dPhotonService__sig: "v",
    siv3dPhotonService__deps: [
        "$siv3dPhotonClient",
        "$siv3dPhotonCallbackCode",
        "siv3dPhotonGeneralCallback",
        "siv3dPhotonClientStateChangeCallback",
        "siv3dPhotonAppStateChangeCallback",
        "siv3dPhotonActorJoinCallback",
        "siv3dPhotonActorLeaveCallback",
        "siv3dPhotonCustomEventCallback",
        "siv3dPhotonOnRoomListUpdateCallback",
        "siv3dPhotonOnRoomPropertiesChangeCallback",
        "siv3dPhotonOnPlayerPropertiesChangeCallback",
        "siv3dPhotonOnHostChangeCallback",
        "$siv3dStringToNewUTF32",
        "$stringToUTF16",
        "$lengthBytesUTF16"
    ],

    $siv3dPhotonSetPingInterval: function (interval) {
        clearInterval(siv3dPhotonClient.pingInterval);
        siv3dPhotonClient.pingInterval = setInterval(function () {
            siv3dPhotonClient.updateRtt();
        }, interval);
    },
    $siv3dPhotonSetPingInterval__deps: ["$siv3dPhotonClient"],

    siv3dPhotonGetServerTime: function () {
        return siv3dPhotonClient.getServerTimeMs();
    },
    siv3dPhotonGetServerTime__sig: "i",
    siv3dPhotonGetServerTime__deps: ["$siv3dPhotonClient"],

    siv3dPhotonGetRoundTripTime: function () {
        return siv3dPhotonClient.getRtt();
    },
    siv3dPhotonGetRoundTripTime__sig: "i",
    siv3dPhotonGetRoundTripTime__deps: ["$siv3dPhotonClient"],

    siv3dPhotonJoinRandomRoom: function (maxPlayers, matchmakingMode, filter_ptr) {
        if (siv3dPhotonClient.waitingCallback) {
            return false;
        }

        const result = siv3dPhotonClient.joinRandomRoom({
            expectedMaxPlayers: maxPlayers,
            matchmakingMode: matchmakingMode,
            expectedCustomRoomProperties: filter_ptr ? JSON.parse(UTF32ToString(filter_ptr)) : null,
        });

        if (result) {
            siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.JoinRandomRoomReturn;
        }

        return result;
    },
    siv3dPhotonJoinRandomRoom__sig: "iiii",
    siv3dPhotonJoinRandomRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode", "$UTF32ToString"],

    siv3dPhotonJoinRandomOrCreateRoom: function (roomName_ptr, opt_ptr, maxPlayers, matchmakingMode, filter_ptr) {
        if (siv3dPhotonClient.waitingCallback) {
            return false;
        }

        const result = siv3dPhotonClient.joinRandomOrCreateRoom(
            {
                expectedMaxPlayers: maxPlayers,
                matchmakingMode: matchmakingMode,
                expectedCustomRoomProperties: filter_ptr ? JSON.parse(UTF32ToString(filter_ptr)) : null,
            },
            UTF32ToString(roomName_ptr),
            opt_ptr ? JSON.parse(UTF32ToString(opt_ptr)) : null,
        );

        if (result) {
            siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.JoinRandomOrCreateRoomReturn;
        }

        return result;
    },
    siv3dPhotonJoinRandomOrCreateRoom__sig: "iiiiii",
    siv3dPhotonJoinRandomOrCreateRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode", "$UTF32ToString"],

    siv3dPhotonJoinRoom: function (roomName_ptr, rejoin) {
        if (siv3dPhotonClient.waitingCallback) {
            return false;
        }

        const result = siv3dPhotonClient.joinRoom(
            UTF32ToString(roomName_ptr),
            { rejoin: rejoin },
        );

        if (result) {
            siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.JoinRoomReturn;
        }

        return result;
    },
    siv3dPhotonJoinRoom__sig: "iii",
    siv3dPhotonJoinRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode", "$UTF32ToString"],

    siv3dPhotonCreateRoom: function (join, roomName_ptr, opt_ptr) {
        if (siv3dPhotonClient.waitingCallback) {
            return false;
        }

        let result;

        if (join) {
            result = siv3dPhotonClient.joinRoom(
                UTF32ToString(roomName_ptr),
                { createIfNotExists: true },
                opt_ptr ? JSON.parse(UTF32ToString(opt_ptr)) : null,
            );
        } else {
            result = siv3dPhotonClient.createRoom(
                UTF32ToString(roomName_ptr),
                opt_ptr ? JSON.parse(UTF32ToString(opt_ptr)) : null,
            );
        }

        if (result) {
            siv3dPhotonClient.waitingCallback = join ? siv3dPhotonCallbackCode.JoinOrCreateRoomReturn : siv3dPhotonCallbackCode.CreateRoomReturn;
        }

        return result;
    },
    siv3dPhotonCreateRoom__sig: "iii",
    siv3dPhotonCreateRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode", "$UTF32ToString"],

    siv3dPhotonReconnectAndRejoin: function () {
        if (siv3dPhotonClient.waitingCallback) {
            return false;
        }

        siv3dPhotonClient.disconnect();

        const result = siv3dPhotonClient.reconnectAndRejoin();

        if (result) {
            siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.ConnectReturn;
        }

        return result;
    },
    siv3dPhotonCreateRoom__sig: "i",
    siv3dPhotonCreateRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode"],

    siv3dPhotonLeaveRoom: function (willComeBack) {
        if (siv3dPhotonClient.waitingCallback) {
            return;
        }

        siv3dPhotonClient.waitingCallback = siv3dPhotonCallbackCode.LeaveRoomReturn;

        if (willComeBack) {
            siv3dPhotonClient.suspendRoom();
        } else {
            siv3dPhotonClient.leaveRoom();
        }
    },
    siv3dPhotonLeaveRoom__sig: "vi",
    siv3dPhotonLeaveRoom__deps: ["$siv3dPhotonClient", "$siv3dPhotonCallbackCode"],

    siv3dPhotonChangeInterestGroup: function (join_len, join_ptr, leave_len, leave_ptr) {
        const join = join_len > 0 ? Array.from(HEAPU8.subarray(join_ptr, join_ptr + join_len)) : join_len == 0 ? null : [];
        const leave = leave_len > 0 ? Array.from(HEAPU8.subarray(leave_ptr, leave_ptr + leave_len)) : leave_len == 0 ? null : [];
        siv3dPhotonClient.changeGroups(leave, join);
    },
    siv3dPhotonChangeInterestGroup__sig: "viiii",
    siv3dPhotonChangeInterestGroup__deps: ["$siv3dPhotonClient"],

    siv3dPhotonRaiseEvent: function (eventCode, data_ptr, opt) {
        return siv3dPhotonClient.raiseEvent(eventCode, data_ptr ? UTF8ToString(data_ptr) : null, JSON.parse(UTF32ToString(opt)));
    },
    siv3dPhotonRaiseEvent__sig: "viii",
    siv3dPhotonRaiseEvent__deps: ["$siv3dPhotonClient", "$UTF32ToString"],

    siv3dPhotonGetRoomList: function (ptr) {
        for (const room of siv3dPhotonClient.availableRooms()) {
            siv3dPhotonClient.storedRoomProperties = Object.entries(room.getCustomProperties());
            _siv3dPhotonGetRoomListCallback(ptr, siv3dStringToNewUTF32(room.name), room.maxPlayers, room.playerCount, room.isOpen);
        }
    },
    siv3dPhotonGetRoomList__sig: "vi",
    siv3dPhotonGetRoomList__deps: ["$siv3dPhotonClient", "siv3dPhotonGetRoomListCallback", "$siv3dStringToNewUTF32"],

    siv3dPhotonGetRoomNameList: function (ptr) {
        for (const room of siv3dPhotonClient.availableRooms()) {
            _siv3dPhotonGetRoomNameListCallback(ptr, siv3dStringToNewUTF32(room.name));
        }
    },
    siv3dPhotonGetRoomNameList__sig: "vi",
    siv3dPhotonGetRoomNameList__deps: ["$siv3dPhotonClient", "siv3dPhotonGetRoomNameListCallback", "$siv3dStringToNewUTF32"],

    siv3dPhotonGetCurrentRoom: function (name_ptr, playerCount_ptr, maxPlayers_ptr, isOpen_ptr) {
        const room = siv3dPhotonClient.myActor().getRoom();
        siv3dPhotonClient.storedRoomProperties = Object.entries(room.getCustomProperties());
        if (name_ptr != 0) setValue(name_ptr, siv3dStringToNewUTF32(room.name), "*");
        if (playerCount_ptr != 0) setValue(playerCount_ptr, room.playerCount, "i32");
        if (maxPlayers_ptr != 0) setValue(maxPlayers_ptr, room.maxPlayers, "i32");
        if (isOpen_ptr != 0) setValue(isOpen_ptr, room.isOpen, "i8");
    },
    siv3dPhotonGetCurrentRoom__sig: "viiii",
    siv3dPhotonGetCurrentRoom__deps: ["$siv3dPhotonClient", "$siv3dStringToNewUTF32"],

    siv3dPhotonGetRoomPlayerList: function (ptr, filter) {
        const room = siv3dPhotonClient.myActor().getRoom();
        const actors = siv3dPhotonClient.myRoomActors();
        for (const actorNr in actors) {
            if (filter >= 0 && filter != actorNr) continue;
            const actor = actors[actorNr];
            _siv3dPhotonGetRoomPlayerListCallback(ptr, actorNr, siv3dStringToNewUTF32(actor.name), siv3dStringToNewUTF32(actor.userId), siv3dPhotonClient.myRoomMasterActorNr() == actorNr, !actor.isSuspended);
        }
    },
    siv3dPhotonGetRoomPlayerList__sig: "vi",
    siv3dPhotonGetRoomPlayerList__deps: ["$siv3dPhotonClient", "siv3dPhotonGetRoomPlayerListCallback", "$siv3dStringToNewUTF32"],

    siv3dPhotonGetRoomPlayerIDList: function (ptr) {
        const room = siv3dPhotonClient.myActor().getRoom();
        const actors = siv3dPhotonClient.myRoomActors();
        for (const actorNr in actors) {
            _siv3dPhotonGetRoomPlayerIDListCallback(ptr, actorNr);
        }
    },
    siv3dPhotonGetRoomPlayerIDList__sig: "vi",
    siv3dPhotonGetRoomPlayerIDList__deps: ["$siv3dPhotonClient", "siv3dPhotonGetRoomPlayerIDListCallback"],

    siv3dPhotonGetIsVisibleInCurrentRoom: function () {
        return siv3dPhotonClient.myActor().getRoom().isVisible;
    },
    siv3dPhotonGetIsVisibleInCurrentRoom__sig: "i",
    siv3dPhotonGetIsVisibleInCurrentRoom__deps: ["$siv3dPhotonClient"],

    siv3dPhotonSetCurrentRoomVisible: function (isVisible) {
        siv3dPhotonClient.myActor().getRoom().isVisible = isVisible;
    },
    siv3dPhotonSetCurrentRoomVisible__sig: "vi",
    siv3dPhotonSetCurrentRoomVisible__deps: ["$siv3dPhotonClient"],

    siv3dPhotonSetCurrentRoomOpen: function (isOpen) {
        siv3dPhotonClient.myActor().getRoom().isOpen = isOpen;
    },
    siv3dPhotonSetCurrentRoomOpen__sig: "vi",
    siv3dPhotonSetCurrentRoomOpen__deps: ["$siv3dPhotonClient"],

    siv3dPhotonUpdateLocalPlayer: function (localId_ptr, isHost_ptr, isActive_ptr) {
        const actor = siv3dPhotonClient.myActor();
        if (localId_ptr != 0) setValue(localId_ptr, actor.actorNr, "i32");
        if (isHost_ptr != 0) setValue(isHost_ptr, siv3dPhotonClient.myRoomMasterActorNr() == actor.actorNr, "i8");
        if (isActive_ptr != 0) setValue(isActive_ptr, !actor.isSuspended, "i8");
    },
    siv3dPhotonUpdateLocalPlayer__sig: "viii",
    siv3dPhotonUpdateLocalPlayer__deps: ["$siv3dPhotonClient"],

    siv3dPhotonGetMasterClientID: function () {
        return siv3dPhotonClient.myRoomMasterActorNr();
    },
    siv3dPhotonGetMasterClientID__sig: "i",
    siv3dPhotonGetMasterClientID__deps: ["$siv3dPhotonClient"],
    

    siv3dPhotonSetUserName: function (userName_ptr) {
        siv3dPhotonClient.myActor().setName(UTF32ToString(userName_ptr));
    },
    siv3dPhotonSetUserName__sig: "vi",
    siv3dPhotonSetUserName__deps: ["$siv3dPhotonClient", "$UTF32ToString"],

    siv3dPhotonSetMasterClient: function (localPlayerID) {
        siv3dPhotonClient.myActor().getRoom().setMasterClient(localPlayerID);
    },
    siv3dPhotonSetMasterClient__sig: "vi",
    siv3dPhotonSetMasterClient__deps: ["$siv3dPhotonClient"],

    siv3dPhotonGetRoomCustomProperty: function (key) {
        const found = siv3dPhotonClient.myRoom().getCustomProperty(String.fromCharCode(key));
        return found ? siv3dStringToNewUTF32(found) : 0;
    },
    siv3dPhotonGetRoomCustomProperty__sig: "ii",
    siv3dPhotonGetRoomCustomProperty__deps: ["$siv3dPhotonClient"],

    siv3dPhotonGetRoomCustomProperties: function (ptr) {
        const obj = siv3dPhotonClient.myRoom().getCustomProperties();
        for (key in obj) {
            _siv3dPhotonGetCustomPropertiesCallback(ptr, key.charCodeAt(0), siv3dStringToNewUTF32(obj[key]));
        }
    },
    siv3dPhotonGetRoomCustomProperties__sig: "vi",
    siv3dPhotonGetRoomCustomProperties__deps: ["$siv3dPhotonClient", "$siv3dStringToNewUTF32", "siv3dPhotonGetCustomPropertiesCallback"],

    siv3dPhotonSetRoomCustomProperty: function (key, value_ptr) {
        const room = siv3dPhotonClient.myRoom();
        room.setCustomProperty(String.fromCharCode(key), UTF32ToString(value_ptr));
        room.setPropsListedInLobby(Object.keys(room.getCustomProperties()));
    },
    siv3dPhotonSetRoomCustomProperty__sig: "vii",
    siv3dPhotonSetRoomCustomProperty__deps: ["$siv3dPhotonClient", "$UTF32ToString"],

    siv3dPhotonReceiveRoomProperties: function (key_ptr, value_ptr) {
        const item = siv3dPhotonClient.storedRoomProperties.pop();
        if (item !== undefined) {
            setValue(key_ptr, item[0].charCodeAt(0), "i8");
            setValue(value_ptr, siv3dStringToNewUTF32(item[1]), "*");
        } else {
            setValue(key_ptr, 0, "*");
        }
    },
    siv3dPhotonReceiveRoomProperties__sig: "vii",
    siv3dPhotonReceiveRoomProperties__deps: ["$siv3dPhotonClient", "$siv3dStringToNewUTF32"],
});
