const express = require('express')
const axios = require('axios')
const cors = require('cors')
const dotenv = require('dotenv')

// Load environment variables from .env file
dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

const PORT = process.env.PORT || 8888;
const LINE_BOT_API = "https://api.line.me/v2/bot"

const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
}

app.get('/test', (req, res) => {
    res.json({
        message: "Hello from the server!"
    })
})

app.post('/send-message', async (req,res) => {
    try {
        const { userId, message } = req.body

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

        console.log("response", response.data)
        res.json({
            message: "Sent successfully",
            responseData: response.data
        })
    } catch (error) {
        console.log("error", error.response)
    }
    
})


app.listen(PORT, (req, res) => {
    console.log(`run at http://localhost:${PORT}`)
})