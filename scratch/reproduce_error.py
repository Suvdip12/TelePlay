import asyncio
import os
import sys
from pyrogram import Client

client = Client("test_session_local", api_id=38544923, api_hash="fc7c2e2a536fcf6c0e6a910b7ffb8b82", bot_token="8934066822:AAFTwENAH7JDvrbjQJW9_ic-n92mEXUuovc")

async def test_start_with_fix():
    print("Testing start with fix:")
    # Rebind client loop and lock
    client.loop = asyncio.get_running_loop()
    client.lock = asyncio.Lock()
    
    # Rebind storage loop and lock
    if hasattr(client, "storage") and client.storage:
        client.storage.loop = asyncio.get_running_loop()
        client.storage.lock = asyncio.Lock()
        
    try:
        await client.start()
        print("Successfully started client with fix!")
        await client.stop()
    except Exception as e:
        import traceback
        traceback.print_exc()

async def main():
    await test_start_with_fix()

asyncio.run(main())
