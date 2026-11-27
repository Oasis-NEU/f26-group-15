import { useState } from "react";
import {supabase} from "../lib/supabase"


export function Login(){
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [password, setPassword] = useState("");


    async function handleLogin(){
        const {data, error} = await supabase.auth.signInWithPassword({email, password});

        if(error){
            setMessage(error.message)
        } else{
            setMessage("Success!, Logged in as: " + data.user.email)

        }
    }
    return (
        <div>
            <input value= {email} onChange = {(e) => setEmail(e.target.value)} placeholder="Email" />
            <input type='password' value= {password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <button onClick={handleLogin}>Login</button>
            <p>{message}</p>
        </div>
    )
}