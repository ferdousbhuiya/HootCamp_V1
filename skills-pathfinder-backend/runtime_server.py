"""Final production bootstrap for Skills Pathfinder.

Loads the open-career API and then installs narrow runtime quality patches that
preserve existing routes while preventing known false-positive skill matches.
"""

from career_server import app
import main as main_module
from skill_quality import install_main_skill_patch

install_main_skill_patch(main_module)
