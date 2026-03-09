const express = require("express")
const multer = require("multer")
const mongoose = require("mongoose")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static("public"))
app.use("/uploads", express.static("uploads"))

mongoose.connect("mongodb://127.0.0.1:27017/storage")

const FileSchema = new mongoose.Schema({
    name: String,
    path: String
})

const File = mongoose.model("File", FileSchema)

const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, "uploads/")
    },
    filename: function(req, file, cb){
        cb(null, Date.now() + "-" + file.originalname)
    }
})

const upload = multer({storage: storage})

app.post("/upload", upload.single("file"), async (req,res)=>{

    const file = new File({
        name: req.file.originalname,
        path: req.file.filename
    })

    await file.save()

    res.json({message:"uploaded"})
})

app.get("/files", async (req,res)=>{

    const files = await File.find()

    res.json(files)
})

app.listen(3000, ()=>{
    console.log("server running")
})