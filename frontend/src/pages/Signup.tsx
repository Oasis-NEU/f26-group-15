import { useState } from "react";
import {supabase} from "../lib/supabase"


export function Signup(){
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [password, setPassword] = useState("");


    async function handleSignup(){
        const {error} = await supabase.auth.signUp({email, password});

        if(error){
            setMessage(error.message)
        } else{
            setMessage("Check your email")

        }
    }
    return (
        <div>
            <input value= {email} onChange = {(e) => setEmail(e.target.value)} placeholder="Email" />
            <input type='password' value= {password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <button onClick={handleSignup}>Signup</button>
            <p>{message}</p>
        </div>
    )
}