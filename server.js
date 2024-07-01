const express = require('express')
const axios = require('axios')
const cors = require('cors')
const dotenv = require('dotenv')

// Load environment variables from .env file
dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

// Initialize const
const PORT = process.env.PORT || 8888;
const LINE_BOT_API = "https://api.line.me/v2/bot"
const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
}

// DST Server Storage
let serverName = ""
let commands = []
let serverStatus = []

app.get('/test', (req, res) => {
    res.json({
        message: "Hello from the server!"
    })
})

// ======================================================================
// ========================= LINE API FUNCTIONS =========================
/** ---------------------------------------------------------------------
  * > Sends a message to a specific user using the Line API.
  * @function sendMessage
  * @param {string} userId - The user ID of the user to receive the message.
  * @param {string} message - The message to send.
  * @returns {Object} - The response from the Line API.
  * --------------------------------------------------------------------- */
const sendMessage = async (userId, message) => {
    try {
        // Construct the request body
        const body = {
            to: userId,  // The ID of the user
            messages: [  // The message to send
                {
                    type: "text",
                    text: message
                }
            ]
        }

        // Send the request to Line API
        const response = await axios.post(`${LINE_BOT_API}/message/push`, body, {headers})
        return response
    } catch (error) {
        console.log("Couldn't send line message")
        throw new Error (error)
    }
}

/** ---------------------------------------------------------------------
  * > Sends a message to every user using the Line API.
  * @function sendBroadMessage()
  * @param {string} message - The message to send.
  * @returns {Object} - The response from the Line API.
  * --------------------------------------------------------------------- */
const sendBroadMessage = async (message) => {
    try {
        // Construct the request body
        const body = {
            messages: [  // The message to send
                {
                    type: "text",
                    text: message
                }
            ]
        }

        // Send the request to Line API
        const response = await axios.post(`${LINE_BOT_API}/message/broadcast`, body, {headers})
        return response
    } catch (error) {
        console.log("Couldn't send init server message")
        throw new Error (error)
    }
}
// ================================= END ================================
// ======================================================================
//
//
// ======================================================================
// =========================== LIFF SERVER API ==========================
/** ---------------------------------------------------------------------
  * > Construct a command and added it into the command list.
  * @function addCommand
  * @param {string} command - The command query from the user.
  * @param {string} userId - The user ID of the user that added the command.
  * @returns {Number} Status Code 201
  * --------------------------------------------------------------------- */
const addCommand = (command, userId) => {
    commands.push({
        'id': commands.length,
        'command': command,
        'status': "New",
        'userId': userId
    })

    console.log(`id: ${commands.length}, command: ${command}`)
    return 201
}

/** ---------------------------------------------------------------------
  * @api {post} /commands Add a new command
  * @apiName AddNewCommand
  * 
  * @apiDescription Add a new command to the command lists from LIFF, and send to game server for execution.
  * 
  * @apiParam {String} command  The command to be added and executed.
  * @apiParam {String} userId   The ID of the user adding the command.
  * 
  * @apiSuccess (201) {String} message  "Command added successfully"
  * @apiSuccess (201) {Number} id       The ID of the added command.
  * @apiSuccess (201) {String} command  The command that was added.
  * @apiSuccess (201) {String} userId   The ID of the user who added the command.
  * 
  * @apiError (400) {String} error  Command not found
  * @apiError (503) {String} error  Server is not initialized
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X POST http://localhost:8080/commands -d '{"command":"c_announce(\'Hello!\')","userId":"12345"}' -H "Content-Type: application/json"
  * --------------------------------------------------------------------- */
app.post('/commands', async (req,res) => {
    console.log("Adding Command: /commands")
    try {
        const { command, userId } = req.body
        if (!command) {
            return res.status(400).json({ error: 'Command not found' });
        }
        if (serverName === "") {
            return res.status(503).json({ error: 'Server is not initialized' });
        }

        const status = addCommand(command, userId)

        res.status(status).json({
            message: "Command added successfully",
            id: commands.length - 1,
            command: command,
            userId: userId
        })
    } catch (error) {  
        console.log("Error Adding Command")
        res.status(500).json({ error: error.message });
    }
})

/** ---------------------------------------------------------------------
  * @api {get} /status Get server status
  * @apiName GetServerStatus
  * 
  * @apiDescription For fetching server status to display on LIFF
  * 
  * @apiSuccess (200) {Object[]} serverStatus             Current server status
  * @apiSuccess (200) {String}   serverStatus.source      The source that triggered the update.
  * @apiSuccess (200) {String}   [serverStatus.player]    Name of the joined/left player.
  * @apiSuccess (200) {Object[]} serverStatus.players     List of players currently in the server.
  * @apiSuccess (200) {Object}   serverStatus.settings    Basic details of the server.
  * @apiSuccess (200) {String[]} serverStatus.mods        Name of all mods used in the server.
  * @apiSuccess (200) {Object}   serverStatus.statevars   Current state of the world in the server.   
  * 
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X GET http://localhost:8080/status
  * --------------------------------------------------------------------- */
app.get('/status', (req, res) => {
    try {
        console.log("Sending Server Status..")
        res.status(200).json({ server: serverStatus });
    } catch (error) {
        console.log("Error Sending Status")
        res.status(500).json({ error: error.message });
    }
})
// ================================= END ================================
// ======================================================================
//
//
// ======================================================================
// =========================== DST SERVER API ===========================
/** ---------------------------------------------------------------------
  * @api {post} /init Initialize server
  * @apiName InitServer
  * 
  * @apiDescription Initialize server name and sending broadcast message.
  * 
  * @apiParam {String} name  Name of server
  * 
  * @apiSuccess (201) {String} message      "Initialize successfully"
  * @apiSuccess (201) {String} serverName   Name of server.
  * 
  * @apiError (400) {String} error  Server data is required
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X POST http://localhost:8080/init -d '{"serverName":"My Server"}' -H "Content-Type: application/json"
  * --------------------------------------------------------------------- */
app.post('/init', async (req,res) => {
    console.log("Receiving: /init")
    try {
        const { name } = req.body
        if (!name) {
            return res.status(400).json({ error: 'Server data is required' });
        }
        serverName = name

        console.log("Initialized server:", serverName)
        
        await sendBroadMessage(`Initialized server: ${serverName}`)
        
        res.status(201).json({
            message: "Initialize successfully",
            serverName: serverName,
        })
    } catch (error) {  
        console.log("Error Initializing Server")
        res.status(500).json({ error: error.message });
    }
})

/** ---------------------------------------------------------------------
  * @api {post} /status Update server status
  * @apiName UpdateServerStatus
  * 
  * @apiDescription Uploading server status from the game server. Optionally, a query parameter can specified and send broadcast message.
  * 
  * @apiParam {Object[]} data             Current server status
  * @apiParam {String}   data.source      The source that triggered the update.
  * @apiParam {String}   [data.player]    Name of the joined/left player.
  * @apiParam {Object[]} data.players     List of players currently in the server.
  * @apiParam {Object}   data.settings    Basic details of the server.
  * @apiParam {String[]} data.mods        Name of all mods used in the server.
  * @apiParam {Object}   data.statevars   Current state of the world in the server.   
  * 
  * @apiQuery {String} [source]             The source that triggered the update.
  * 
  * @apiSuccess (201) {String} message      "Status updated successfully"
  * 
  * @apiError (400) {String} error  Data is missing
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X POST http://localhost:8080/status?source=ms_playerjoined -d '{
  *         "source": "ms_playerjoined",
  *         "player": "Frosty",
  *         "players": [{ "steamid": "76561198153135402", "name": "Frosty", "admin": true, "userid": "KU_iC59_m4l", "prefab": "wormwood", "age": 12 }],
  *         "settings": { "adminonline": true, "description": "now only one server", "maxplayers": 6, "gamemode": "survival", "name": "Frosty's No Cave" },
  *         "mods": ["APITest"],
  *         "statevars": { "season": "autumn", "time": 0.85, "cycles": 25, ... }
  *     }' -H "Content-Type: application/json"
  * --------------------------------------------------------------------- */
app.post('/status', async (req,res) => {
    console.log("Receiving: /status")
    try {
        const data = req.body
        const statusFilter = req.query.source;

        if (!data) {
            return res.status(400).json({ error: 'Data is missing' });
        }

        serverStatus = data
        if (statusFilter === "ms_playerjoined") {
            await sendBroadMessage(`Player Joined: ${data.player}`)
        }
        if (statusFilter === "ms_playerleft") {
            await sendBroadMessage(`Player Left: ${data.player}`)
        }

        res.status(201).json({
            message: "Status updated successfully",
        })

    } catch (error) {  
        console.log("Error Uploading Status")
        res.status(500).json({ error: error.message });
    }
})

/** ---------------------------------------------------------------------
  * > Get every commands with a specific status
  * @function getCommand
  * @param {string} status - The command status to filter by.
  * @returns {Array} - An array of commands with the specified status.
  * --------------------------------------------------------------------- */
const getCommand = (status) => {
    if (status) {
        return commands.filter((command) => command.status === status)
    }
    return []
}

/** ---------------------------------------------------------------------
  * @api {get} /commands Get command history
  * @apiName GetCommandHistory
  * 
  * @apiDescription For fetching the command logs that has been sent to the server, or fetching commands with a specific status.
  *                 For game server, every command with status New will be fetch through status query and updated to Sent.
  * 
  * @apiQuery {String} [status] The command status to filter by.
  * 
  * @apiSuccess (200) {Object[]} commands           All the commands that the user query.
  * @apiSuccess (200) {Number}   commands.id        ID of the command
  * @apiSuccess (200) {String}   commands.command   The command itself
  * @apiSuccess (200) {String}   commands.status    Status of the command
  * @apiSuccess (200) {String}   commands.userId    The user ID that sent the command
  * 
  * @apiSuccess (200) {String}   message            "No commands with {status} currently" (If no command has the specified status)
  * 
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X GET http://localhost:8080/commands
  *     curl -X GET http://localhost:8080/commands?status=New
  * --------------------------------------------------------------------- */
app.get('/commands', (req, res) => {
    try {
        const statusFilter = req.query.status;

        // For LIFF to get all commands
        if (!statusFilter) {
            return res.status(200).json({ commandLog: commands });
        }

        // For server to fetch new commands with status=New
        const command_list = getCommand(statusFilter)

        if (command_list.length === 0) {
            return res.status(200).json({ message: `No commands with ${statusFilter} currently` });
        }

        if (statusFilter === "New") {
            command_list.forEach(cmd => {
                cmd.status = "Sent"
            })
        }

        res.status(200).json({ commands: command_list });
    } catch (error) {
        console.log("Error Pending Commands")
        res.status(500).json({ error: error.message });
    }
})

/** ---------------------------------------------------------------------
  * > Get a specific command via ID
  * @function getCommandById
  * @param {string} id - The ID of the command to retrieve.
  * @returns {Object} - The command with the specified ID.
  * --------------------------------------------------------------------- */
const getCommandById = (id) => {
    return commands.find((command) => command.id === parseInt(id, 10))
}

/** ---------------------------------------------------------------------
  * @api {post} /commands/:id Update the command status
  * @apiName UpdateCommandStatus
  * 
  * @apiDescription Update the selected command with a new status after executed in game, and send message to the user that sent the command.
  * 
  * @apiParam {String} status   The status to update the command.
  * 
  * @apiQuery {String} id       The command ID to update.
  * 
  * @apiSuccess (200) {String} id       ID of the updated command.
  * @apiSuccess (200) {String} command  The command itself
  * @apiSuccess (200) {String} status   New status of the command
  * 
  * @apiError (404) {String} error  Command not found
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X POST http://localhost:8080/commands/1 -d '{"status": "OK"}' -H "Content-Type: application/json"
  * --------------------------------------------------------------------- */
app.post('/commands/:id', async (req,res) => {
    console.log("Updating: /id")
    try {
        const { status } = req.body
        const command = getCommandById(req.params.id)
        console.log(`command: ${command.command}, status: ${status}`)

        if (!command) {
            return res.status(404).json({ error: 'Command not found' })
        }
        
        if (!status) {
            status = "Unknown"
        }

        command.status = status
        await sendMessage(command.userId, `ID: ${command.id}, status: ${command.status}`)
        res.status(200).json({
            id: command.id,
            command: command.command,
            status: command.status
        })
    } catch (error) {  
        console.log("Error Updating ID Command")
        res.status(500).json({ error: error.message });
    }
})

// app.post('/clear', async (req,res) => {
//     console.log("Clearing...")
//     try {
//         serverName = ""
//         commands = []
//         serverStatus = []

//         res.status(200).json({
//             message: "Clearing server successfully. You can initialize again."
//         })
//     } catch (error) {  
//         console.log("Error Clearing Server")
//         res.status(500).json({ error: error.message });
//     }
// })
// ================================= END ================================
// ======================================================================
//
//
//
// ======================================================================
// ============================= LINE STUFF =============================
/** ---------------------------------------------------------------------
  * @api {post} /line-send-message Send message to user in Line
  * @apiName LineSendMessage
  * 
  * @apiDescription Send a message to a specific user using the Line API.
  * 
  * @apiParam {String} userId    The user ID of the user to receive the message.
  * @apiParam {String} message   The message to send.
  * 
  * @apiSuccess (200) {String} message       "Sent successfully"
  * @apiSuccess (200) {String} responseData  Response from the Line API
  * 
  * @apiError (500) {String} error  Internal server error
  * 
  * @apiExample {curl} Example usage:
  *     curl -X POST http://localhost:8080/line-send-message -d '{"userId": "U0123456789", "message": "Hello"}' -H "Content-Type: application/json"
  * --------------------------------------------------------------------- */
app.post('/line-send-message', async (req,res) => {
    try {
        const { userId, message } = req.body
        const response = await sendMessage(userId, message)

        console.log("response", response.data)
        res.status(200).json({
            message: "Sent successfully",
            responseData: response.data
        })
    } catch (error) {
        console.log("Error Sending Line Message")
        res.status(500).json({ error: error.message });
    }
})

/** ---------------------------------------------------------------------
  * > This is for receiving event webhook
  * > Initiate clearing server if the message sent is "clear"
  * --------------------------------------------------------------------- */
app.post('/webhook', async (req, res) => {
    const { events } = req.body
    try {
        if (!events || events.length === 0) {
            return false
        }
    
        const event = events[0]
        const userId = event.source.userId

        //Clear Command
        if (event.type === "message" && event.message.type === "text") {
            const command = event.message.text
            if (command === "clear") {
                serverName = ""
                commands = []
                serverStatus = []
                await sendMessage(userId, "Clearing the server...")
            }
        }
        res.status(200).json({
            message: "OK"
        })
        console.log("events", events)
    } catch (error) {
        console.log("Error Webhook")
        res.status(500).json({ error: error.message });
    }
})
// ================================= END ================================
// ======================================================================
//
//
// Listen for PORT
app.listen(PORT, (req, res) => {
    console.log(`run at https://ikkrix-msg-api-218c41e663aa.herokuapp.com on PORT ${PORT}`)
})