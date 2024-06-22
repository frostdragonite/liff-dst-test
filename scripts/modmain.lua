local _G = GLOBAL
local TheNet = _G.TheNet
local TheSim = _G.TheSim
local TheShard = _G.TheShard
local loadstring = _G.loadstring
local pcall = _G.pcall
local assert = _G.assert
-- Get/Set fEnv is Lua 5.1 specific!
print("Lua version: " .. _G._VERSION)
local setfenv = _G.setfenv
local getfenv = _G.getfenv

local CONFIG_GETCOMMANDS_FREQUENCY = 5
local CONFIG_SENDSTATUS_FREQUENCY = 60


local function printTable(table)
    for key, value in pairs(table) do
        print(key, value)
    end
end


print(TheNet)
print(TheNet and TheNet:GetIsServer())
if TheNet and TheNet:GetIsServer() then	
	print("I am a server!")
    -- Get server data for building report (These are const and won't be ever changing)
	local SERVER_NAME = TheNet:GetDefaultServerName()
	local SERVER_DESCRIPTION = TheNet:GetDefaultServerDescription()
	local SERVER_MAXPLAYERS = TheNet:GetDefaultMaxPlayers()
	local SERVER_GAMEMODE = TheNet:GetDefaultGameMode()
	local SERVER_MODSLIST = TheNet:GetServerModNames()

    -- This function is for building the report. Contains server data and put it in a JSON format.
    local function BuildReport(source)
		local data = {}
		local settings = {}
		local players = {}
		local statevars = {}

        -- Filling up settings table
		settings["name"] = SERVER_NAME
		settings["description"] = SERVER_DESCRIPTION
		settings["maxplayers"] = SERVER_MAXPLAYERS
		settings["gamemode"] = SERVER_GAMEMODE
		settings["adminonline"] = TheNet:GetServerHasPresentAdmin()

        -- Filling up players table
        -- Containing [name, character, day_survived, steamid, klei_id, isAdmin]
		n = 1
		for i, v in ipairs(TheNet:GetClientTable()) do
			players[n] = {}
			players[n]["name"] = v.name
			players[n]["prefab"] = v.prefab
			players[n]["age"] = v.playerage
			
			if v.steamid == nil or v.steamid == '' then
				players[n]["steamid"] = v.netid
			else
				players[n]["steamid"] = v.steamid
			end
			
			players[n]["userid"] = v.userid
			players[n]["admin"] = v.admin
			n = n+1
		end
		
        -- Filling up world state table
        -- Check worldstate.lua
		for k, v in pairs(_G.TheWorld.state) do
			statevars[k] = v
		end
		
		data["source"] = source
		data["settings"] = settings
		data["mods"] = SERVER_MODSLIST
		data["statevars"] = statevars
		data["players"] = players	
		
		--- As per scripts\json.lua: encode() is not json compliant, only use encode_compliant()
		data = _G.json.encode_compliant(data)

		return data
	end

	-- Encoding pointers: https://docs.coronalabs.com/tutorial/data/encodeURL/index.html
	local API_URL = "http://localhost:8888"
	local API_COMMANDS = API_URL .. "/commands"
	local COMMAND_LIST = "commands.lua"

	-- Load commands function from external file
	local function ApiRefresh()
		apiFile_commands = _G.kleiloadlua(MODROOT .. COMMAND_LIST)
		if apiFile_commands then
			-- Set environment for apiFile_commands to current global environment (this file)
			-- This make apiFile_commands able to access our global variables
			setfenv(apiFile_commands, getfenv(0))
			pcall(apiFile_commands)
		end
	end
	ApiRefresh()

	-- For declaring global commands that the console will recognise.
	-- from "Show Me" id=666155465
	-- Basically, check if _G has key "gname", if not create it as default.
	local GetGlobal=function(gname,default)
		local res=_G.rawget(_G,gname)
		if default and not res then
			_G.rawset(_G,gname,default)
			return false
		else
			return res
		end
	end
	
	-------------------------------------------------------------------------------------------
	-- I "suspect" async HTTP queries are handled like this:
	-- TheSim:QueryServer(URL, function(...) MyCallback(...) end, "GET")
	-- TheSim:QueryServer(URL, function(...) self:MyCallback(...) end, "POST", DATA)
	-- function EmailSignupScreen:OnPostComplete( result, isSuccessful, resultCode )
	-------------------------------------------------------------------------------------------

	-- Generic Callback when posting a message to an external host:
	local function onStatusResponse(response, isSuccessful, resultCode)
		if isSuccessful and string.len(response) > 0 and resultCode == 200 or resultCode == 201 then
			print("Successful POST", resultCode)
			print(response)
		else
			print("POST request failed. Result code:", resultCode)
		end
	end

	-- Helper function
	local function fix_web_string(text)
		if type(text) ~= "string" then
			text = tostring(text)
		end
		text = string.gsub(tostring(text), "\\r\\n", "\\n")
		return text
	end

	-- PUT Server Status
	local function SendStatus(inst, source)
		data = BuildReport(source)
		print("Sending build report:")
		print("Source:", source)
		TheSim:QueryServer(
			API_URL .. "/status",
			function(...) onStatusResponse(...) end,
			"POST",
			data
		)
	end

	-------------------------------------------------------------------------------------------
	
	-- Execute Remote-Commands
	local function enactRPC(cmd)
		response = {}
		print("Processing RPC ID: " .. cmd.id)
		
		-- Execute and send status
		if cmd.command == "start" then
			response["status"] = "OK"
		else
			myCmd = loadstring(cmd.command)
			print(myCmd)
			if pcall(myCmd) then
				response["status"] = "OK"
				print("Ok")
			else
				response["status"] = "FAIL"
				print("Fail")
			end
		end

		-- Send Response Back (To update status)
		print("Done executing, updating command status:")
		TheSim:QueryServer(
			API_COMMANDS .. "/" .. cmd.id ,
			function(...) onStatusResponse(...) end,
			"POST",
			_G.json.encode_compliant(response)
		)
	end
	
	-- Fetch pending commands from API server
	-- recieves: {"commands": [{"id": 0, "command": "start", "result": null}, {"id": 3, "command": "revive", "result": null}]}	
	local function onCommandsResponse(response, isSuccessful, resultCode)
		if isSuccessful and string.len(response) > 0 and resultCode == 200 then
			response = fix_web_string(response)
			print("New Commands... Raw data: " .. response)
			
			-- Getting the body
			data = _G.json.decode(response)
			printTable(data)
			if data.commands then
				for index,cmd in pairs(data.commands) do
					enactRPC(cmd)
				end
			end
		end
	end

	-- Noisy function!
	local function getCommandsQuery(inst, source)
		print("Fetching commands from API server (source:", source, ")")
		TheSim:QueryServer(
					API_COMMANDS .. "?status=New",
					function(...) onCommandsResponse(...) end,
					"GET"
				)
	end

	----------------
	-- Initialize Global Variables
	local function Console_Put()
		SendStatus(nil, "command")
	end
	GetGlobal("api_announce", Console_Put)

	local function Console_Get()
		getCommandsQuery(nil, "command")
	end
	GetGlobal("api_getcmd", Console_Get)

	local function Console_Refresh()
		pcall(ApiRefresh)
	end
	GetGlobal("api_refresh", Console_Refresh)
	--------------
	local function SendServerInit()
		local server = {
			name = SERVER_NAME,
		}

		print("Initializing Server...")
		print(SERVER_NAME)
		TheSim:QueryServer(
			API_URL .. "/init",
			function(...) onStatusResponse(...) end,
			"POST",
			_G.json.encode_compliant(server)
		)
	end

    AddPrefabPostInit("world", function(inst)
		SendServerInit()

		print("Adding listen for event and do periodic tasks...")
        -- inst:ListenForEvent("phasechanged", function(inst) SendStatus(inst, "phasechanged") end)
        inst:ListenForEvent("ms_playerjoined", function(inst) SendStatus(inst, "ms_playerjoined") end)
        inst:ListenForEvent("ms_playerleft", function(inst) SendStatus(inst, "ms_playerleft") end)
        inst:DoPeriodicTask(CONFIG_SENDSTATUS_FREQUENCY, function(inst) SendStatus(inst, "schedule") end)
        inst:DoPeriodicTask(CONFIG_GETCOMMANDS_FREQUENCY, function(inst) getCommandsQuery(inst, "schedule") end)
    end)
end

print("I works!")