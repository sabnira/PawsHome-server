require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000



//middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zlvar1f.mongodb.net/?appName=Cluster0`;



const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // await client.connect();

        const userCollection = client.db("pawsHomeDb").collection("users")
        const petCollection = client.db("pawsHomeDb").collection("pets")
        const adoptionCollection = client.db("pawsHomeDb").collection("adoptions");

        //jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            // create token
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' })

            res.send({ token })
        })


        // verifyToken middlewares
        const verifyToken = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization);

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next()
            })

        }



        //users related api
        app.get('/users', verifyToken, async (req, res) => {
            console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            //insert email if user does'nt exists
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        })


    
        //get all pets data from db and search and category
        app.get('/pets', async (req, res) => {

            const { searchParams, category } = req.query;

            let option = {};

            if (searchParams) {
                option.name = {
                    $regex: searchParams,
                    $options: "i"
                };
            }

            if (category) {
                option.category = category;
            }

            const result = await petCollection.find(option).toArray();

            res.send(result);
        });

        //get a single pet data by id from db
        app.get('/pet/:id', async (req, res) => {
            try {
                const id = req.params.id
                const query = { _id: new ObjectId(id) }
                const result = await petCollection.findOne(query)

                if (!result) return res.status(404).send({ message: 'Pet not found' })
                res.send(result)

            } catch (err) {
                res.status(400).send({ message: 'Invalid pet id' })
            }
        })

        //pet adoption form
        app.post("/adoptions", async (req, res) => {
            try {
                const adoptionData = req.body;

                const result = await adoptionCollection.insertOne(adoptionData);

                res.status(201).send({
                    success: true,
                    message: "Adoption request submitted successfully",
                    result,
                });
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    success: false,
                    message: "Failed to submit adoption request",
                });
            }
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from PawsHome!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
