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

// DST Server API Init
let serverName = ""
let commands = []
let serverStatus = []


app.get('/test', (req, res) => {
    res.json({
        message: "Hello from the server!"
    })
})

// ======================================================================
// =========================== LINE FUNCTIONS ===========================
// ======================================================================
// Send a Message
const sendMessage = async (userId, message) => {
    try {
        const body = {
            to: userId,
            messages: [
                {
                    type: "text",
                    text: message
                }
            ]
        }

        const response = await axios.post(`${LINE_BOT_API}/message/push`, body, {headers})
        return response
    } catch (error) {
        console.log("Couldn't send line message")
        throw new Error (error)
    }
}

// ======================================================================
// =========================== LIFF SERVER API ==========================
// ======================================================================
// For Adding Commands
const addCommand = (command) => {
    commands.push({
        'id': commands.length,
        'command': command,
        'status': "New"
    })

    console.log(`id: ${commands.length}, command: ${command}`)
    return 201
}

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

        const status = addCommand(command)

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
// ======================================================================
// For fetching server status
app.get('/status', (req, res) => {
    try {
        console.log("Sending Server Status..")
        res.status(200).json({ server: serverStatus });
    } catch (error) {
        console.log("Error Sending Status")
        res.status(500).json({ error: error.message });
    }
})
// =========================== LIFF SERVER API ==========================
// ======================================================================
//
//
//
// ======================================================================
// =========================== DST SERVER API ===========================
// ======================================================================
// For Initializing Server
app.post('/init', async (req,res) => {
    console.log("Receiving: /init")
    try {
        const { name } = req.body
        if (!name) {
            return res.status(400).json({ error: 'Server data is required' });
        }
        serverName = name

        console.log("Initialized server:", serverName)
        res.status(201).json({
            message: "Initialize successfully",
            serverName: serverName,
        })
    } catch (error) {  
        console.log("Error Initializing Server")
        res.status(500).json({ error: error.message });
    }
})
// ======================================================================
// For Uploading Server Status
app.post('/status', async (req,res) => {
    console.log("Receiving: /status")
    try {
        const data = req.body

        if (!data) {
            return res.status(400).json({ error: 'Data is missing' });
        }

        serverStatus = data
        res.status(201).json({
            message: "Status updated successfully",
        })
    } catch (error) {  
        console.log("Error Uploading Status")
        res.status(500).json({ error: error.message });
    }
})
// ======================================================================
// For Fetching pending commands lists
const getCommand = (status) => {
    if (status) {
        return commands.filter((command) => command.status === status)
    }
    return []
}

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
// ======================================================================
// For Updating executed commands
const getCommandById = (id) => {
    return commands.find((command) => command.id === parseInt(id, 10))
}

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
        await sendMessage(userId, `ID: ${command.id}, status: ${command.status}`)
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
// ======================================================================
// For clearing server
app.post('/clear', async (req,res) => {
    console.log("Clearing...")
    try {
        serverName = ""
        commands = []
        res.status(200).json({
            message: "Clearing server successfully. You can initialize again."
        })
    } catch (error) {  
        console.log("Error Clearing Server")
        res.status(500).json({ error: error.message });
    }
})
// =========================== DST SERVER API ===========================
// ======================================================================
//
//
//
// ======================================================================
// ============================= LINE STUFF =============================
// ======================================================================
// For Sending Message
app.post('/line-send-message', async (req,res) => {
    try {
        const { userId, message } = req.body
        const response = await sendMessage(userId, message)

        console.log("response", response.data)
        res.json({
            message: "Sent successfully",
            responseData: response.data
        })
    } catch (error) {
        console.log("Error Sending Line Message")
        res.status(500).json({ error: error.message });
    }
})

app.post('/line-webhook', async (req, res) => {
    const { events } = req.body
    try {
        if (!events || events.length === 0) {
            
            const event = events[0]
            const userId = event.source.userId
    
            res.json({
                message: "OK"
            })
            return false
        }
    
        console.log("events", events)
    } catch (error) {
        console.log("Error Webhook")
        res.status(500).json({ error: error.message });
    }
})



// Listen for PORT
app.listen(PORT, (req, res) => {
    console.log(`run at https://ikkrix-msg-api-218c41e663aa.herokuapp.com on PORT ${PORT}`)
})