import asyncio

# Create and set event loop BEFORE importing any app modules
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

import os
import tempfile
from PIL import Image
from app.telegram import tg_client
from app.config import get_settings

async def main():
    settings = get_settings()
    print(f"Storage channel ID: {settings.telegram_storage_channel_id}")
    print("Starting client...")
    await tg_client.start()
    try:
        print("Sending test photo...")
        im = Image.new("RGB", (100, 100), color="blue")
        tmp_path = os.path.join(tempfile.gettempdir(), "test_send.jpg")
        im.save(tmp_path)
        
        res = await tg_client.send_photo(
            settings.telegram_storage_channel_id,
            tmp_path
        )
        print("Success! File ID:", res.photo[-1].file_id)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    except Exception as e:
        print("Failed to send photo:", e)
        import traceback
        traceback.print_exc()
    finally:
        await tg_client.stop()

if __name__ == "__main__":
    try:
        loop.run_until_complete(main())
    finally:
        loop.close()
