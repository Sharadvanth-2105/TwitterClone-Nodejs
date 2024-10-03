const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const intializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB error ${e.message}`)
    process.exit(1)
  }
}

intializeDbAndServer()

// API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const getQuery = `INSERT INTO user(name,username,password,gender)
        VALUES('${name}','${username}','${hashedPassword}','${gender}');`
      await db.run(getQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isValidPassword = await bcrypt.compare(password, dbUser.password)
    if (isValidPassword === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Autheticate Token
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// API 3

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const userFollowingTweetsQuery = `
       SELECT
		user.username, tweet.tweet, tweet.date_time AS dateTime
	FROM
		follower
	INNER JOIN
		tweet
	ON
		follower.following_user_id = tweet.user_id
	INNER JOIN
		user
	ON
		tweet.user_id = user.user_id
	WHERE
		follower.follower_user_id = ${getUserId.user_id}
	ORDER BY
		tweet.date_time DESC
	LIMIT 4;`
  const getTweetsFromFollowings = await db.all(userFollowingTweetsQuery)
  response.send(getTweetsFromFollowings)
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const getUserFollowingAccounts = `SELECT user.name FROM user INNER JOIN follower 
  ON follower.following_user_id=user.user_id 
  WHERE follower.follower_user_id='${getUserId.user_id}';`
  const resultQuery = await db.all(getUserFollowingAccounts)
  response.send(resultQuery)
})

// API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const getUserFollowersAccounts = `SELECT user.name FROM user INNER JOIN follower
  ON follower.follower_user_id=user.user_id 
  WHERE follower.following_user_id='${getUserId.user_id}';`
  const resultQuery = await db.all(getUserFollowersAccounts)
  response.send(resultQuery)
})

// API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const query = `SELECT tweet.tweet,
  (SELECT COUNT(*) FROM like WHERE tweet_id=tweet.tweet_id) AS likes,
  (SELECT COUNT(*) FROM reply WHERE tweet_id=tweet.tweet_id) AS replies,
  tweet.date_time AS dateTime
  FROM tweet JOIN follower ON follower.following_user_id=tweet.user_id
  WHERE  tweet.tweet_id=${tweetId} AND
  follower.follower_user_id='${getUserId.user_id}';`
  const resultQuery = await db.get(query)
  if (resultQuery) {
    response.send(resultQuery)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

// API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    const query = `SELECT username FROM user INNER JOIN like 
    ON user.user_id=like.user_id INNER JOIN tweet ON
    like.tweet_id=tweet.tweet_id INNER JOIN follower ON 
    tweet.user_id=follower.following_user_id
    WHERE like.tweet_id=${tweetId} AND
    follower.follower_user_id='${getUserId.user_id}';`
    const resultQuery = await db.all(query)
    if (resultQuery.length > 0) {
      response.send({likes: resultQuery.map(like => like.username)})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    const query = `SELECT
        user.name ,
        reply.reply
      FROM
        reply 
      JOIN
        user ON reply.user_id = user.user_id
      JOIN
        tweet  ON reply.tweet_id = tweet.tweet_id
      JOIN
        follower ON tweet.user_id = follower.following_user_id
      WHERE
        reply.tweet_id = ${tweetId} AND
        follower.follower_user_id = '${getUserId.user_id}';`
    const queryResult = await db.all(query)
    if (queryResult.length > 0) {
      response.send({replies: queryResult})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const query = `SELECT tweet.tweet,
  (SELECT COUNT(*) FROM like WHERE tweet_id=tweet.tweet_id) AS likes,
  (SELECT COUNT(*) FROM reply WHERE tweet_id=tweet.tweet_id) AS replies,
  tweet.date_time AS dateTime
  FROM tweet
  WHERE tweet.user_id='${getUserId.user_id}';`
  const resultQuery = await db.all(query)
  response.send(resultQuery)
})

// API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const tweetDetails = request.body
  const {tweet} = tweetDetails
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const query = `INSERT INTO tweet(tweet,user_id) VALUES ('${tweet}','${getUserId.user_id}');`
  await db.run(query)
  response.send('Created a Tweet')
})

// API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    const query = `DELETE FROM tweet WHERE tweet_id=${tweetId} AND 
  user_id='${getUserId.user_id}';`
    const resultQuery = await db.run(query)
    if (resultQuery.changes === 1) {
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)
module.exports = app
