export async function handleRoot(req,res) {
    return res.status(200).send({
        message: 'Welcome to the root of the API',
        success : true
    })
}