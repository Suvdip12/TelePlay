import asyncio
from pyrogram import Client

client = Client("test_session", api_id=38544923, api_hash="fc7c2e2a536fcf6c0e6a910b7ffb8b82")

async def main():
    # Attempt to reset loop and locks
    client.loop = asyncio.get_running_loop()
    client.lock = asyncio.Lock()
    if hasattr(client, "storage"):
        client.storage.lock = asyncio.Lock()
    
    print("Re-assigned loop and locks successfully!")

asyncio.run(main())
