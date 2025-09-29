const express = require('express')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')
const initializepassport = require('./passportconfig')
const SecretsManager = require("@aws-sdk/client-secrets-manager");
const {} = require("./auth.js")

//AWS
const S3 = require("@aws-sdk/client-s3") // AWS S3
const S3Presigner = require("@aws-sdk/s3-request-presigner");
const { Upload } = require("@aws-sdk/lib-storage")
const { PassThrough } = require('stream');
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const bucketName = 'n10851879-test' // Test Bucket Name
s3Client = new S3.S3Client({ region: 'ap-southeast-2'})


// router for routes // Delete


//Default
const app = express()
app.set("view engine", "ejs") // For using ejs 
app.use(express.urlencoded({ extended: true })); // To get forms from EJS
dotenv.config() // Configuratio
app.use(express.json()) // For parsing json


/////
initializepassport(
    passport, 
    username =>  users.find(user => user.username === username),
    id => users.find(user => user.id === id),
)
app.use(flash())
app.use(session({
    secret: process.env.SESSIONKEY,
    resave: false,
    saveUninitialized: false
}))
const users =[]
app.use(passport.initialize())
app.use(passport.session())
/////


//Multer 
/*const storage = multer.diskStorage({
    destination: (req, file, cb) =>{
        cb(null, 'upload')
    },
    filename: (req, file, cb) => {
        console.log(file)
        cb(null, Date.now() + path.extname(file.originalname))
    }
})
const upload = multer({storage: storage})

//Create uplaod file if doesnt exist
if(!fs.existsSync("upload")){fs.mkdirSync("upload")}*/






//Upload page
app.get('/upload', checkauthenticated,(req,res) =>{
    res.render("upload")
})

//S3 Upload
app.post('/upload',checkauthenticated, async (req,res)=>{
    // Return Upload Presigned URL
    const {filename} = req.body
    //const {filename, contentType} = req.body
    try {
        const command = new S3.PutObjectCommand({
                Bucket: bucketName,
                Key: filename,
                //ContentType: contentType
            });
        const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600} );
        console.log(presignedURL);
        //console.log("Received:", filename, contentType);
        res.json({url :presignedURL})
    } catch (err) {
        console.log(err);
    }
})

// Transcode the video from S3
app.post('/transcode', async (req,res) =>{
    const {filename} = req.body
    let transcodedkey = `transcoded${filename}`
    let response

    // Create and send a command to read an object, Download the video from S3
    try {
        response = await s3Client.send(
            new S3.GetObjectCommand({
                Bucket: bucketName,
                Key: filename,
            }))
    const video = response.Body
    const videostream = new PassThrough()

    //Creating Upload, uploading mp4 video
    const uploads3 = new Upload({
        client: s3Client,
        params: {
            Bucket: bucketName,
            Key:transcodedkey,
            Body: videostream,
            ContentType: 'video/mp4'
        }
    })

    // Transcoding Using FFMPEG
    ffmpeg(video)
    .outputOptions('-movflags frag_keyframe+empty_moov') // Used because MP4 does not work well with streams
    .videoCodec('libx264')
    .format('mp4')
    .on('error', (err) => {
    console.error('Error:', err.message);
    res.status(500).send("Transcoding Failed :(")
    return;
    })
    .pipe(videostream, {end: true})

    // Start Uploading
    await uploads3.done()

    // Create a pre-signed URL for reading an object
    const command = new S3.GetObjectCommand({
            Bucket: bucketName,
            Key: transcodedkey,
            ResponseContentDisposition: 'attachment; filename="transcodedvideo.mp4"', // Used for directly downloading from presigned URL
        });
    const downloadpresignedURL = await S3Presigner.getSignedUrl(s3Client, command, {expiresIn: 3600} );
    res.json({url :downloadpresignedURL})

    // Delete Original Video    
    const data = await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: filename
    }));
    console.log("Success. Object deleted.", data);
    // Delete Original Video 

    }catch (err) {
        console.log(err);
    }
})

//Upload Video Transcoding, Used AI to find the ffmpeg setting to create high CPU usage.
/*app.post('/upload', checkauthenticated,upload.single("video"), (req,res)=>{
    const inputpath = req.file.path
    const outputfilename = req.body.filename + '.mp4'
    const outputpath = `upload/${outputfilename}`
    ffmpeg(inputpath)
    .output(outputpath)
    .videoCodec('libx264') //LOW CPU TESTING
    //.videoCodec('libx265') UNCOMMENT
    //.audioCodec('aac') UNCOMMENT
    //.videoBitrate('1000k')//10000Max UNCOMMENT
    //.audioBitrate('192k') 
    //.size('3480x2160')
    // .addOptions([ UNCOMMENT
    // '-preset', 'veryslow',  // Pass the preset as a custom FFmpeg option
    // //'-threads', '1',        // Force single-thread encoding for maximum CPU usage
    // ])
    .on('end', async() => {
    console.log('Transcoding complete.');
    fs.unlinkSync(inputpath)
    const filestream = fs.createReadStream(outputpath)
    s3Client = new S3.S3Client({ region: 'ap-southeast-2' });
    try {
    const response = await s3Client.send(
        new S3.PutObjectCommand({
            Bucket: bucketName,
            Key: outputfilename,
            Body: filestream
        })
    );
    console.log(response);
    } catch (err) {
        console.log(err);
    }
    res.render('download', { downloadPath: `/download/${outputfilename}` });
    })
    .on('error', (err) => {
    console.error('Error:', err.message);
    res.status(500).send("Transcoding Failed :(")
    })
    .run();
})

// Download
app.get('/download/:filename', checkauthenticated,(req, res) => {
  const filepath = path.join(__dirname, 'upload', req.params.filename);
  res.download(filepath);
});*/


//Login
app.get('/', checknotauthenticated,(req, res)=>{    
    res.render("login")
})

// this is the login thing that you should do/check/add your aws thing to!!
app.post('/', checknotauthenticated,passport.authenticate('local',{
    successRedirect:'/upload',
    failureRedrect:'/login',
    failureFlash:true
}),(req, res)=>{
    res.render("upload")
})


//Register
app.get('/register',checknotauthenticated ,(req, res)=>{    
    res.render("register")
})

app.post('/register',checknotauthenticated,async(req, res)=>{
    try {
        const hashedpassword = await bcrypt.hash(req.body.password,10)
        users.push({
            id: Date.now().toString(),
            username: req.body.username,
            password: hashedpassword,
        })
        res.redirect('/')
    } catch (error) {
        res.redirect('/register')
    }
    console.log(users)

})








function checkauthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }

  res.redirect('/login')
}

function checknotauthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/')
  }
  next()
}


const secretName = "n11908157-clientSecret"

const client = new SecretsManager.SecretsManagerClient({
    region: "ap-southeast-2"
})


async function main() {
    try {
        response = await client.send(
            new SecretsManager.GetSecretValueCommand({
                SecretId: secretName
            })
        )
        const secret = response.secretString;
        console.log(secret)
    }
    catch(error) {
        console.log(error)
    }
}

//Default
app.listen(3000, () => {
    main();
})
console.log("Port Connected")