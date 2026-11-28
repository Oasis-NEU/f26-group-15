import os 
from dotenv import load_dotenv
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./labelai.db")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")



"""
9 steps: (1) Database connection, (2) Projects, split into 2a–2d, 
(3) Switch to Supabase Postgres, (4) Classes and datasets, 
(5) Images and Supabase Storage, (6) Annotations, 
(7) YOLO predict, (8) Export, (9) Auth.

"""


