-- Initializing Globals
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

-- Configure settings
local CONFIG_GETCOMMANDS_FREQUENCY = 5
local CONFIG_SENDSTATUS_FREQUENCY = 60

-- Create Server API
if TheNet and TheNet:GetIsServer() then	
	-- Get server data for building report (These are const and won't be ever changing)
	local SERVER_NAME = TheNet:GetDefaultServerName()
	local SERVER_DESCRIPTION = TheNet:GetDefaultServerDescription()
	local SERVER_MAXPLAYERS = TheNet:GetDefaultMaxPlayers()
	local SERVER_GAMEMODE = TheNet:GetDefaultGameMode()
	local SERVER_MODSLIST = TheNet:GetServerModNames()

	-- This function is for building the report. Contains server data and put it in a JSON format.
	-- data = {
	-- 	settings : For basic world details, server name, max palyers, gamemode, etc.
	-- 	players : For current players in the server
	-- 	statevars : For world state variables
	-- 	mods : For mods installed on the server
	--  source : The source that call for building report
	--  player : The player that call for building report if the source is from player joined/left
	-- }
	local function BuildReport(source, player)
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
			n = n + 1
		end

		-- Filling up world state table
		-- Check worldstate.lua
		for k, v in pairs(_G.TheWorld.state) do
			statevars[k] = v
		end
		
		-- Populating data
		data["settings"] = settings
		data["players"] = players
		data["mods"] = SERVER_MODSLIST
		data["statevars"] = statevars

		-- Adding source
		data["source"] = source
		-- Adding player name if source is from player joined/left
		if (player ~= nil) then
			data["player"] = player.name
		end
		
		--- As per scripts\json.lua: encode() is not json compliant, only use encode_compliant()
		data = _G.json.encode_compliant(data)
		return data
	end

	-- Set API Paths
	local API_URL = "https://ikkrix-msg-api-218c41e663aa.herokuapp.com"
	local API_COMMANDS = API_URL .. "/commands"
	local COMMAND_LIST = "commands.lua"

	-- Load commands function from external file (commands.lua)
	local function ApiRefresh()
		apiFile_commands = _G.kleiloadlua(MODROOT .. COMMAND_LIST)
		if apiFile_commands then
			-- Set environment for apiFile_commands to current global environment (this file)
			-- This make apiFile_commands able to access our global variables
			-- As like the user can call the function directly with console
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
	-- Response Params : (response, isSuccessful, resultCode)
	-------------------------------------------------------------------------------------------

	-- Generic Callback for server log:
	local function onStatusResponse(response, isSuccessful, resultCode)
		if isSuccessful and string.len(response) > 0 and resultCode == 200 or resultCode == 201 then
			print("Successful POST", resultCode, response)
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

	-- Sending Server Status
	local function SendStatus(inst, source, player)
		data = BuildReport(source, player)
		print("Sending Server Status, Source:", source)
		TheSim:QueryServer(
			API_URL .. "/status" .. "?source=" .. source,
			function(...) onStatusResponse(...) end,
			"POST",
			data
		)
	end

	-------------------------------------------------------------------------------------------

	-- Execute Remote-Commands
	local function enactRPC(cmd)
		response = {}

		-- Execute and send status
		myCommand = loadstring(cmd.command)
		if pcall(myCommand) then
			response["status"] = "OK"
		else
			response["status"] = "FAIL"
		end
		
		-- Send Response Back (To update status)
		TheSim:QueryServer(
			API_COMMANDS .. "/" .. cmd.id ,
			function(...) onStatusResponse(...) end,
			"POST",
			_G.json.encode_compliant(response)
		)
	end

	-- Fetch pending commands from API server
	-- Example: {
	--	"commands": [
	--		{"id": 2, "command": "c_announce('Hello')", "status": "New", "userId": "U0123456789"},
	--		{"id": 3, "command": c_sethealth(1)", "status": "New", "userId": "U0123456789"}
	--	]
	-- }	
	local function onCommandsResponse(response, isSuccessful, resultCode)
		if isSuccessful and string.len(response) > 0 and resultCode == 200 then
			-- Get the command body
			response = fix_web_string(response)
			data = _G.json.decode(response)

			-- Execute each command in the list
			if data.commands then
				for _,command in pairs(data.commands) do
					enactRPC(command)
				end
			end
		end
	end

	-- Send GET request for pending commands (source is unused for now)
	local function getCommandsQuery(inst, source)
		TheSim:QueryServer(
			API_COMMANDS .. "?status=New",
			function(...) onCommandsResponse(...) end,
			"GET"
		)
	end
	
	-------------------------------------------------------------------------------------------

	-- Initialize Global Variables
	local function Console_Put()
		SendStatus(nil, "console")
	end
	GetGlobal("api_announce", Console_Put)

	local function Console_Get()
		getCommandsQuery(nil, "console")
	end
	GetGlobal("api_getcmd", Console_Get)

	local function Console_Refresh()
		pcall(ApiRefresh)
	end
	GetGlobal("api_refresh", Console_Refresh)

	-------------------------------------------------------------------------------------------

	-- Send Server Initialization
	local function SendServerInit()
		local server = {
			name = SERVER_NAME,
		}
		
		TheSim:QueryServer(
			API_URL .. "/init",
			function(...) onStatusResponse(...) end,
			"POST",
			_G.json.encode_compliant(server)
		)
	end

	-- Add everything to the world so that it gets loaded
	AddPrefabPostInit("world", function(inst)
		-- Initialize server
		SendServerInit()
		
		-- Adding event listeners to send status
		inst:ListenForEvent("phasechanged", function(inst) SendStatus(inst, "phasechanged") end)
		inst:ListenForEvent("ms_playerjoined", function(inst, player) SendStatus(inst, "ms_playerjoined", player) end)
		inst:ListenForEvent("ms_playerleft", function(inst, player) SendStatus(inst, "ms_playerleft", player) end)

		-- Adding periodic tasks to fetch pending commands and send status periodically
		inst:DoPeriodicTask(CONFIG_SENDSTATUS_FREQUENCY, function(inst) SendStatus(inst, "schedule") end)
		inst:DoPeriodicTask(CONFIG_GETCOMMANDS_FREQUENCY, function(inst) getCommandsQuery(inst, "schedule") end)
    end)
end