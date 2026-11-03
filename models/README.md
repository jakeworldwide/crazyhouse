# models

Every thing in the house, one .glb each, in a folder per room. Where each
one goes is `house.json` (the level); what they do is `components.js`.
See "How the house is put together" in the main README.

Making a new one in Blender (File > Export > glTF 2.0, Format: glTF Binary):

- 1 unit = 1 foot (or say if it's meters)
- origin at the bottom centre, where it sits on the floor
- apply transforms before exporting (Ctrl+A > All Transforms)
- moving parts (doors, lids, heads) as separate named objects, origin at the hinge
- small textures (64 to 256 px), packed into the .glb
- one material per model where you can

Then add a line for it in house.json (copy one that's close), or say what
it is and where it goes.
